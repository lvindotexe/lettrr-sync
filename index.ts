import { parseHTML } from 'npm:linkedom';
import { daily } from 'https://deno.land/x/deno_cron@v1.0.0/cron.ts';

type Movie = {
	imdb_id: string;
	name: string;
	year: string;
};

type MovieInfo = { letter_id: string } & Movie;

const db = await Deno.openKv('database/movies');
const user = await Deno.readTextFile('config.json').then((contents) =>
	JSON.parse(contents) as { username: string }
);

function findMoviesInList(
	document: Document,
): Promise<Array<MovieInfo>> {
	return Promise.all(
		[...document.getElementsByClassName('linked-film-poster')].map(
			async (e) => {
				const { attributes } = e;
				const letter_id = attributes.getNamedItem('data-film-id')?.value!;
				const movieLink = attributes.getNamedItem('data-film-slug')?.value;
				const movieInfo = await fetchMovieInfo(movieLink!);
				return { letter_id, ...movieInfo };
			},
		),
	);
}

export async function fetchList(url: string) {
	const { document } = await fetch(url)
		.then((response) => response.text())
		.then(parseHTML);
	const finalPage = [...document.getElementsByTagName('a')]
		.filter((e) => e.href.includes('page'))
		.map((e) => Number(e.href.split('/').at(-2)))
		.reduce((largest, curr) => curr > largest ? curr : largest, 1);
	if (finalPage === 1) return findMoviesInList(document);
	return await Promise.all(
		[...Array(finalPage + 1).keys()].slice(-1).reverse().map((num) =>
			fetch(`${url}/page/${num}`)
				.then((response) => response.text())
				.then(parseHTML)
				.then(({ document }) => findMoviesInList(document))
		),
	)
		.then((list) => list.flat());
}

export async function updateList(url: string) {
	const movies = await fetchList(url);
	const moviesDB = new Map<string, MovieInfo>();
	const moviesIter = db.list<MovieInfo>({ prefix: ['movies'] });
	for await (const { value } of moviesIter) moviesDB.set(value.imdb_id, value);
	for (const [i, movie] of movies.entries()) {
		const { value } = await db.get<MovieInfo>(['movies', movie.name]);
		if (value) delete movies[i];
		moviesDB.delete(movie.imdb_id);
	}
	for await (const movie of movies) {
		if (movie) await db.set(['movies', movie.name], movie);
	}
	for await (const movie of moviesDB.values()) {
		await db.delete(['movies', movie.name]);
	}
}

async function fetchMovieInfo(
	slug: string,
): Promise<Movie> {
	const { document } = await fetch(`https://letterboxd.com${slug}`).then(
		(response) => response.text().then(parseHTML),
	);
	let imdb_id: string;
	let year: string;
	const name = document.querySelector('meta[property="og:title"]')
		//@ts-expect-error slutty types
		?.content as string;
	for (const tag of document.getElementsByTagName('a')) {
		const { href, textContent } = tag;
		if (href.includes('/films/year') && tag.textContent) {
			year = tag.textContent;
			continue;
		}
		if (href.includes('www.imdb.com') && textContent) {
			imdb_id = href.split('/').at(-2)!;
			continue;
		}
	}
	//@ts-expect-error slutty types
	if (!imdb_id || !year) throw new Error('unable to find id or year');
	return { imdb_id, year, name };
}

daily(() => updateList(`https://letterboxd.com/${user}/watchlist`));
Deno.serve(async () => {
	const moviesIter = db.list<MovieInfo>({ prefix: ['movies'] });
	const movies = [];
	for await (const { value } of moviesIter) movies.push(value);
	return new Response(JSON.stringify(movies));
});
