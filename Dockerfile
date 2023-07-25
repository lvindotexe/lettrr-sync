FROM denoland/deno

WORKDIR /app

ADD ./app /app

RUN mkdir -p /app/database

RUN deno cache index.ts 

CMD ["run", "--allow-net","--unstable","--allow-read","--allow-write","--allow-env" , "index.ts"]
