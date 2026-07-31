#!/bin/sh
echo "window.env = `jo \`env | grep REACT_APP_\``" > /usr/share/nginx/html/js/env.js
sed -i 's/${NGINX_HOST}/'"$NGINX_HOST"'/' /etc/nginx/conf.d/default.conf
sed -i 's/${NGINX_PORT}/'"$NGINX_PORT"'/' /etc/nginx/conf.d/default.conf

# Add env.js script to index.html if not already present
if ! grep -q "/js/env.js" /usr/share/nginx/html/index.html; then
    sed -i '/<head>/a \    <script src="/js/env.js"></script>' /usr/share/nginx/html/index.html
fi

# Browser tab title. Applied here rather than baked into the bundle so one
# image can serve several deployments; unset leaves the stock "erxes".
if [ -n "$REACT_APP_APP_TITLE" ]; then
    sed -i "s|<title>[^<]*</title>|<title>$REACT_APP_APP_TITLE</title>|" \
        /usr/share/nginx/html/index.html
fi

exec "$@"   