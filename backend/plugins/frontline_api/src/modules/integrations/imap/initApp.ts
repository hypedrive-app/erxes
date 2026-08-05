import {
  getEnv,
  getSubdomain,
  getSaasOrganizations,
  getSaasCoreConnection,
  extractUserFromHeader,
} from 'erxes-api-shared/utils';
import { generateModels } from '~/connectionResolvers';
import { routeErrorHandling, findAttachmentParts, toUpper } from './utils';
import { imapListen } from './messageBroker';
import { redlock } from './redlock';
import express from 'express';
import { createImap } from './imapClient';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { finished } from 'stream/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { Base64Decode } from 'base64-stream';
import * as dotenv from 'dotenv';

dotenv.config();

const { NODE_ENV } = process.env;

const distributeJobsForSubdomain = async (subdomain: string) => {
  const models = await generateModels(subdomain);
  let lock;

  try {
    lock = await redlock.acquire(
      [`${subdomain}:imap:work_distributor`],
      60000,
    );
  } catch (e) {
    console.log(e);
    lock = null;
  }

  try {
    const integrations = await models.ImapIntegrations.find({
      healthStatus: 'healthy',
    });
    for (const integration of integrations) {
      imapListen({
        subdomain,
        data: {
          _id: integration._id,
        },
      });
    }
  } catch (error) {
    console.error(`Job distribution error for ${subdomain}:`, error);
  } finally {
    if (lock && typeof lock.unlock === 'function') {
      try {
        await lock.unlock();
      } catch (unlockError) {
        console.error('Lock unlock error:', unlockError);
      }
    }
  }
};

const startDistributingJobs = async (subdomain: string) => {
  if (NODE_ENV === 'production') {
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }

  while (true) {
    try {
      await distributeJobsForSubdomain(subdomain);
      await new Promise((resolve) => setTimeout(resolve, 10 * 60 * 1000));
    } catch (error) {
      console.error('distributeWork error', error);
    }
  }
};

const startSaasDistributingJobs = async () => {
  await getSaasCoreConnection();

  if (NODE_ENV === 'production') {
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }

  while (true) {
    try {
      const organizations = await getSaasOrganizations();
      const subdomains = organizations
        .map((org) => org.subdomain)
        .filter(Boolean);
      await Promise.all(subdomains.map(distributeJobsForSubdomain));
      await new Promise((resolve) => setTimeout(resolve, 10 * 60 * 1000));
    } catch (error) {
      console.error('distributeWork error', error);
    }
  }
};

const onServerInitImap = async (app) => {
  console.log('********* IMAP ********');

  app.use(
    express.json({
      limit: '15mb',
    }),
  );

  app.use((_req, _res, next) => {
    next();
  });

  app.get(
    '/read-mail-attachment',
    routeErrorHandling(
      async (req, res, next) => {
        // This route serves a customer's private email attachments and had no
        // authentication at all — anyone who could reach it and guess (or
        // enumerate) a messageId/integrationId pair could download them.
        //
        // Plugins never authenticate a request themselves: the gateway runs
        // `userMiddleware` on every request, verifies the JWT/auth-token
        // cookie against its redis session, and forwards the resolved user as
        // a base64 `user` header (setUserHeader). Apollo's context does the
        // same extraction for every GraphQL request; plain Express routes
        // registered via onServerInit get nothing automatically and have to
        // read that header themselves, which is what this does. A request
        // that did not come through the gateway carries no such header and is
        // rejected here.
        const user = extractUserFromHeader(req.headers);

        if (!user?._id) {
          return res.sendStatus(401);
        }

        const subdomain = getSubdomain(req);
        const models = await generateModels(subdomain);

        const { messageId, integrationId, filename } = req.query;

        const integration = await models.ImapIntegrations.findOne({
          inboxId: integrationId,
        });

        if (!integration) {
          throw new Error('Integration not found');
        }

        const sentMessage = await models.ImapMessages.findOne({
          messageId,
          inboxIntegrationId: integrationId,
          type: 'SENT',
        });

        let folderType = 'INBOX';

        if (sentMessage) {
          folderType = '[Gmail]/Sent Mail';
        }

        const imap = createImap(integration);

        imap.once('ready', () => {
          imap.openBox(folderType, true, async (err, box) => {
            imap.search(
              [['HEADER', 'MESSAGE-ID', messageId]],
              function (err, results) {
                if (err) {
                  imap.end();
                  return next(err);
                }

                let f;

                try {
                  f = imap.fetch(results, { bodies: '', struct: true });
                } catch (e) {
                  imap.end();
                  return next(e);
                }

                f.on('message', function (msg) {
                  msg.once('attributes', function (attrs) {
                    const attachments = findAttachmentParts(attrs.struct);

                    if (attachments.length === 0) {
                      imap.end();
                      return res.status(404).send('Not found');
                    }

                    for (let i = 0, len = attachments.length; i < len; ++i) {
                      const attachment = attachments[i];

                      if (attachment.params.name === filename) {
                        const f = imap.fetch(attrs.uid, {
                          bodies: [attachment.partID],
                          struct: true,
                        });

                        f.on('message', (msg) => {
                          // The MIME filename is attacker-controlled: it comes
                          // straight from the Content-Disposition header of a
                          // raw email sent to the monitored mailbox. Never use
                          // it to build a disk path directly — basename()
                          // strips any directory components (including `../`
                          // traversal and absolute paths) so only the leaf
                          // name is ever used, and only for the download
                          // filename we hand back to the client.
                          const downloadName = basename(
                            attachment.params.name,
                          ).replace(/[\x00-\x1f\x7f]/g, '');
                          const encoding = attachment.encoding;

                          // Write to a per-request-unique temp path instead of
                          // a fixed name derived from user input. A fixed,
                          // predictable path let two concurrent requests for
                          // same-named attachments interleave writes and serve
                          // back each other's content; a UUID-suffixed temp
                          // file removes both the path-traversal target and
                          // the cross-request race.
                          const tmpPath = join(
                            tmpdir(),
                            `imap-attachment-${randomUUID()}`,
                          );
                          const writeStream = fs.createWriteStream(tmpPath);

                          msg.on('body', function (stream) {
                            if (toUpper(encoding) === 'BASE64') {
                              stream.pipe(new Base64Decode()).pipe(writeStream);
                            } else {
                              stream.pipe(writeStream);
                            }
                          });

                          const cleanup = () =>
                            fsPromises
                              .rm(tmpPath, { force: true })
                              .catch(() => undefined);

                          // `finished()` rather than a `writeStream.once('close')`
                          // registered inside the `msg.once('end')` callback:
                          // 'close' may already have been emitted by the time
                          // that callback runs, and Node does not replay events
                          // for late listeners, so the response would hang
                          // forever and leak the temp file. `finished()` is
                          // documented to handle exactly this late-registration
                          // case, and resolves only once the file is fully
                          // flushed to disk — which is what makes it safe to
                          // serve.
                          msg.once('end', function () {
                            imap.end();

                            finished(writeStream)
                              .then(
                                () =>
                                  new Promise<void>((resolve, reject) => {
                                    res.download(
                                      tmpPath,
                                      downloadName,
                                      (err) => (err ? reject(err) : resolve()),
                                    );
                                  }),
                              )
                              .catch((err) => {
                                // Headers are already on the wire once the
                                // download starts streaming, so a failure past
                                // that point can only be logged, not turned
                                // into an error response.
                                if (!res.headersSent) {
                                  next(err);
                                }
                              })
                              .finally(cleanup);
                          });
                        });
                      }
                    }
                  });
                });
              },
            );
          });
        });

        imap.connect();
      },
      (res) => res.send('ok'),
    ),
  );

  // const VERSION = getEnv({ name: 'VERSION' });

  // if (VERSION && VERSION === 'saas') {


  //   startSaasDistributingJobs().catch((err) => {
  //     console.error('[IMAP] Failed to start SAAS job distributors:', err);
  //   });
  // } else {
  //   startDistributingJobs('os');
  // }
};

export default onServerInitImap;
