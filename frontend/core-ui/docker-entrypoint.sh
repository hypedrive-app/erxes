#!/bin/sh
# Serialise every REACT_APP_* var into window.env.
#
# `jo \`env | grep REACT_APP_\`` looks equivalent but silently corrupts any
# value containing a space: the unquoted command substitution is word-split, so
# REACT_APP_APP_TITLE="Sharks Marketing" reaches jo as two arguments and lands
# as "Sharks". Feed the lines in one at a time instead, which keeps each
# key=value intact whatever it contains.
env | grep '^REACT_APP_' | {
    set --
    while IFS= read -r line; do
        set -- "$@" "$line"
    done
    echo "window.env = $(jo "$@")" > /usr/share/nginx/html/js/env.js
}
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