# Static marketing site — served by nginx, fronted by the host's reverse proxy
# (Coolify assigns the domain + TLS). Self-contained: index.html has no external
# assets (inline CSS/JS, hand-written WebGL, data-URI favicon).
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
# Long cache for the single asset; nginx already sets sane defaults otherwise.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location = / { try_files /index.html =404; }\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
