FROM nginx:1.29.4-alpine

COPY nginx.conf /etc/nginx/nginx.conf

COPY ./static-html-directory /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]