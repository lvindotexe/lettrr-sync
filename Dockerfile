FROM denoland/deno

EXPOSE ${PORT}

WORKDIR /app

ADD ./app /app

RUN mkdir -p /app/database

RUN deno cache index.ts 

COPY .env /app/

CMD ["run", "--allow-net","--unstable","--allow-read","--allow-write","--allow-env" , "index.ts"]