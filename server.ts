const PORT = 3000;
const db = await Deno.openKv("database/movies");
Deno.serve(
  { port: PORT, onListen: () => console.log(`listening on port: ${PORT}`) },
  async () => {
    const moviesIter = db.list({ prefix: ["movies"] });
    const movies = [];
    for await (const { value } of moviesIter) {
      movies.push(value);
    }
    return new Response(JSON.stringify(movies));
  },
);
