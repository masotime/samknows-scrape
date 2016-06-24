import Promise from 'bluebird';

export function throttled(promiseGeneratingFn, batchSize = 100) {
	let count = 0;
	let waitChain = Promise.resolve();
	let promiseQueue = [];

	return (...args) => {
		if (count % batchSize === 0) {
			// awkward, because of the mutable aspect of promiseQueue
			waitChain = (
				(queue, count) => 
					waitChain.then(() => {
						console.log(`Completed ${count}`);
						return Promise.all(queue)
					})
				)(promiseQueue, count);
			promiseQueue = [];
		}

		const tail = waitChain.then(() => promiseGeneratingFn(...args));
		promiseQueue.push(tail);
		count += 1;
		return tail;
	}
}

export function unrelenting(promiseGeneratingFn) {
	return (...args) => promiseGeneratingFn(...args).catch(() => unrelenting(promiseGeneratingFn)(...args));
}

export async function execute(main) {
	try {
		await main();
	} catch (err) {
		console.error(err && err.stack || err);
		for (let key in err) {
			if (key !== 'stack') {
				console.error(err[key]);
			}
		}
	}
}