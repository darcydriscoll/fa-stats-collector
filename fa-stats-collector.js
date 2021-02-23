javascript:/* run on the furaffinity.net domain */

{
	
	class EmptyGalleryError extends Error {
		constructor(...params) {
			super(...params);
			if (Error.captureStackTrace) {
				Error.captureStackTrace(this, EmptyGalleryError);
			}
			this.name = 'EmptyGalleryError';
		}
	}
	
	class FetchFailureError extends Error {
		constructor(statusCode, statusText, ...params) {
			super(...params);
			if (Error.captureStackTrace) {
				Error.captureStackTrace(this, FetchFailureError);
			}
			this.name = 'FetchFailureError';
			this.statusCode = statusCode;
			this.statusText = statusText;
		}
	}
	
	class FAError extends Error {
		constructor(loc, ...params) {
			super(...params);
			if (Error.captureStackTrace) {
				Error.captureStackTrace(this, FAError);
			}
			this.name = 'FAError';
			this.loc = loc;
		}
	}
	
	class FAMessage extends Error {
		constructor(message, ...params) {
			super(...params);
			if (Error.captureStackTrace) {
				Error.captureStackTrace(this, FAMessage);
			}
			this.name = 'FAMessage';
			this.message = message;
		}
	}
	
	class FAStats {
		constructor(username) {
			this.username = username;
			this.featured_url = null;
			this.original_title = document.title;
		}
		
		static notifyProgress(str) {
			console.log(str);
			document.title = str;
		}
		
		static checkFAAnomaly(doc) {
			/* check for System Error */
			let system_error_check = doc.querySelector('.section-header h2');
			if (system_error_check && system_error_check.innerHTML === 'System Error') {
				throw new FAError('system_error');
			}
			/* check for System Message */
			let system_message_check = doc.querySelector('.section-body h2');
			if (system_message_check && system_message_check.innerHTML === 'System Message') {
				let system_message = doc.querySelector('.section-body p');
				if (system_message) {
					throw new FAMessage(system_message.innerHTML);
				} else {
					throw new FAMessage(doc.querySelector('.section-body').innerHTML);
				}
			}
		}
		
		static createDocument(html_text) {
			/* create a HTMLDocument */
			let doc = document.implementation.createHTMLDocument('createDocument');
			/* write the html to the document */
			doc.open();
			doc.write(html_text);
			doc.close();
			/* check for error */
			FAStats.checkFAAnomaly(doc);
			return doc;
		}
		
		static checkFetchResponse(response, fun) {
			if (!response.ok) {
				throw new FetchFailureError(response.status, response.statusText);
			} else {
				return fun();
			}
		}
		
		getGalleryPages(init_pages, mode) {
			let gallery_url = 'https://www.furaffinity.net/' + mode + '/' + this.username;
			return fetch(gallery_url)
			.then(response => FAStats.checkFetchResponse(response, () => response.text()))
			.then(gallery_text => {
				/* notify of gallery loading */
				FAStats.notifyProgress('Retrieved page 1 of ' + mode);
				let retrieveNextPage = function(pages) {
					/* if there exists a next page */
					/*console.log(pages[pages.length-1].querySelectorAll('.submission-list > div > div')[2].querySelector('form'));*/
					if (pages[pages.length-1].querySelectorAll('.submission-list > div > div')[2].querySelector('form') !== null) {
						/* grab next page */
						return fetch(gallery_url + '/' + (pages.length + 1))
						.then(response => FAStats.checkFetchResponse(response, () => response.text()))
						.then(data => {
							/* turn into document */
							let page = FAStats.createDocument(data);
							/* push through */
							pages.push(page);
							FAStats.notifyProgress('Retrieved page ' + pages.length + ' of ' + mode);
							return pages;
						}).then(retrieveNextPage);
					} else {
						console.log(pages);
						return pages;
					}
				}.bind(this);
				/* get document out of gallery page 1 */
				let gallery = FAStats.createDocument(gallery_text);
				
				return Promise.resolve(init_pages.concat(gallery)).then(retrieveNextPage);
			});
		}
		
		getStats() {
			/* get the featured submission url */
			fetch('https://www.furaffinity.net/user/' + this.username)
			.then(response => FAStats.checkFetchResponse(response, () => response.text()))
			.then(profile_text => {
				/* notify of profile loading */
				FAStats.notifyProgress('Retrieved user profile');
				let profile = FAStats.createDocument(profile_text);
				/* retrieve featured URL */
				if (profile.querySelector('.userpage-section-left').children.length == 2) {
					let featured = profile.querySelector('.userpage-featured-title h2 a');
					featured = featured.getAttribute('href');
					this.featured_url = 'https://www.furaffinity.net' + featured;
					/* notify of featured URL obtain */
					FAStats.notifyProgress('Retrieved featured submission URL');
				} else {
					/* notify of no featured URL */
					FAStats.notifyProgress('No featured submission URL');
				}
			})
			/* get the htmls for the gallery pages */
			.then(() => this.getGalleryPages([], 'gallery'))
			.then(gallery_pages => this.getGalleryPages(gallery_pages, 'scraps'))
			.then(pages => {
				/* get all submission urls */
				let sub_urls = [];
				/* ensuring that at least one page has submissions */
				/* map, then reduce to avoid repetition */
				/* can we short circuit the reduction? */
				const reducer = (accumulator, currentValue) => {
					let submissions = currentValue.querySelector('#gallery-gallery').querySelectorAll('figure');
					if (submissions.length === 0) {
						return accumulator || false;
					} else {
						return accumulator || true;
					}
				};
				if (!pages.reduce(reducer, false)) {
					throw new EmptyGalleryError();
				}
				for (let page of pages) {
					/* retrieve the figures for each submission */
					let submissions = page.querySelector('#gallery-gallery').querySelectorAll('figure');
					/* fetch submission urls */
					for (let sub of submissions) {
						let sub_url = sub.querySelector('a').getAttribute('href');
						sub_urls.push('https://www.furaffinity.net' + sub_url);
					}
				}
				
				/* 	Enumerate through and retrieve stats from submission URLs using nested promises.
					Adapted from Javascript: The Definitive Guide 7ed ('Asynchronous Javascript')
				*/
				let retrieveNextStats = function(stats_obj) {
					/* no more submissions to retrieve from -- stop */
					if (sub_urls.length === 0) {
						return stats_obj;
					} else {
						/* get next URL */
						let next_url = sub_urls.shift();
						/* fetch, process */
						return fetch(next_url)
						.then(response => response.text())
						.then(data => {
							/* create submission stats object to store submission stats */
							let sub_stats = {};
							/* create a HTMLDocument to store the html */
							let submission = FAStats.createDocument(data);
							/* retrieve the stats */
							let stats_container = submission.querySelector('.stats-container').querySelectorAll('div');
							/* put stats in sub stats object */
							sub_stats.views = stats_container[0].querySelector('span').innerHTML;
							sub_stats.comments = stats_container[1].querySelector('span').innerHTML;
							if (stats_container[2].querySelector('span a') === null) {
								sub_stats.favourites = stats_container[2].querySelector('span').innerHTML;
							} else {
								sub_stats.favourites = stats_container[2].querySelector('span a').innerHTML;
							}
							if (next_url == this.featured_url) {
								sub_stats.featured = 1;
							} else {
								sub_stats.featured = 0
							}
							/* retrieve title and remove title tags */
							let title = submission.querySelector('.submission-title h2 p').innerHTML;
							/* put sub stats in stats object */
							stats_obj[title] = sub_stats;
							/* inform */
							FAStats.notifyProgress('Retrieved ' + title);
							/* return stats object for next callback */
							return stats_obj;
						})
						.then(retrieveNextStats); /* nest next promise, passing in updated stats_obj */
					}
				}.bind(this);
				/* first Promise in chain -- passes in empty stats_obj */
				return Promise.resolve(new Object()).then(retrieveNextStats);
			})
			.then(stats_obj => {
				/* print stats to console */
				let date = new Date();
				let datetime = 	date.toLocaleDateString('en-AU')
								+ ' ' + date.toLocaleTimeString('en-AU');
				let output = '';
				for (let [title, stats] of Object.entries(stats_obj)) {
					if (title.includes(',')) {
						title = '"' + title + '"';
					}
					output 	+= datetime + ',' + title + ',' + stats.featured
							+ ',' + stats.views + ',' + stats.favourites
							+ ',' + stats.comments + '\n';
				}
				alert(output);
			})
			.catch(e => {
				if (e instanceof EmptyGalleryError) {
					console.error(e);
					alert('Oh no... ' + this.username + ' seems to have no submissions. Maybe you need to log in or change your content settings?');
				} else if (e instanceof FetchFailureError) {
					console.error(e);
					alert(	'Oh no... an error happened! I tried to get a webpage but it failed with a status code of ' +
							e.statusCode + ' and status text of ' + e.statusText +
							'. Maybe you will let me know?');
				} else if (e instanceof TypeError) {
					console.error(e);
					alert('Oh no... an error happened! Make sure to run the script on furaffinity.net. If you did, will you let me know? I got this error message: ' + e);
				} else if (e instanceof FAError) {
					console.error(e);
					if (e.loc === 'system_error') {
						alert('Oh no... a FurAffinity system error happened! Are you sure that username exists? If you are, try running the script again.');
					}
				} else if (e instanceof FAMessage) {
					console.error(e);
					alert('Oh no... FurAffinity stopped me with a system message. It reads, \'' + e.message + '\'.');
				} else {
					console.error(e);
					alert('Oh no... an error happened! Maybe you will let me know? I got this error message: ' + e);
				}
			})
			.finally(() => {
				document.title = this.original_title;
			});
		}
	}
	
	let username = prompt('Enter a username as it would appear in a URL:');
	if (!username) {
		alert('It doesn\'t look like you entered a username... why do you hate me?');
	} else {
		new FAStats(username).getStats();
	}
}
