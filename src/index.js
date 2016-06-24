import Scraper from 'webscrape';
import fs from 'fs';
import Promise from 'bluebird';
import { throttled, unrelenting, execute } from './util';

Promise.promisifyAll(fs);

const SAMKNOWS_ROOT = "http://forums.hardwarezone.com.sg/next-generation-broadband-network-ngbn-forum-320/samknows-singapore-campaign-3684527.html"
const REPORT_DATERANGE_REGEX = /^From\s+([0-9]+\s+[a-zA-Z]+\s+[0-9]+)\s+to\s+([0-9]+\s+[a-zA-Z]+\s+[0-9]+)/
const REPORT_ISP_REGEX = /^ISP\s+\-\s+(.+)$/
const REPORT_MEASURE_REGEX = /^([0-9\.]*)([%a-zA-Z]+)/
const SAMKNOWS_LINK_SELECTOR = 'div[id^="post_message"]>a[href^="http://reporting.samknows.com/reportcard"],div[id^="post_message"]>a[href^="https://reporting.samknows.com/reportcard"]'

async function main() {
	const scraper = Scraper();

	const { $ } = await scraper.get(SAMKNOWS_ROOT);

	const data = {};
	const lastLink = $('li.prevnext a[title*="Last Page"]').attr('href');
	const lastPage = parseInt(/([0-9]+)\.html$/.exec(lastLink)[1], 10);
	const links = [ SAMKNOWS_ROOT ];

	for (let i = 2; i <= lastPage; i += 1) {
		links.push(SAMKNOWS_ROOT.replace(/\.html$/, `-${i}.html`));
	}

	data.links = links;

	console.log(`All links to samknows thread interpolated. Total of ${data.links.length} pages fetched.`);

	const reportRetriever = throttled(unrelenting(getReports), 30);
	const statisticsRetriever = throttled(unrelenting(getStatistics), 30);
	const reports = await Promise.all(data.links.map(reportRetriever));

	// we now need to compress the links and remove duplicates.  First link takes priority.
	const reportLinks = {};

	for (let page = 0; page < reports.length; page += 1) {
		const pagelinks = reports[page];
		for (let linkIdx = 0; linkIdx < pagelinks.length; linkIdx += 1) {
			const linkData = pagelinks[linkIdx];

			// skip if it already exists
			if (!reportLinks.hasOwnProperty(linkData.link)) {
				reportLinks[linkData.link] = {
					uri: linkData.link,
					username: linkData.username,
					origin: linkData.origin
				};
			}
		}
	}

	// TODO: ???? "because async only works with arrays", we convert it back to arrays
	const reportLinksArray = [];
	for (let key in reportLinks) {
		reportLinksArray.push(reportLinks[key]);
	}

	console.log('Fetched the following user-samknows links:');
	console.log(JSON.stringify(reportLinksArray, null, 4));	

	console.log('Now attempting to read actual Samknows reports data');
	const statistics = await Promise.all(reportLinksArray.map(statisticsRetriever));

	console.log('Fetched statistics as follows:');
	console.log(JSON.stringify(statistics, null, 4));
	console.log('================');
	console.log('Writing statistics to file data.json');

	await fs.writeFileAsync('data.json', JSON.stringify(statistics));

}

async function getReports(uri) {
	const { $ } = await Scraper().get(uri);
	const links = [];

	console.log(`Getting links for ${uri}`);

	// start from the outside
	$('table[id^="post"]').each(function() {
		const $elem = $(this); // yuk
		const samknowsLinks = $elem.find(SAMKNOWS_LINK_SELECTOR);

		if (samknowsLinks.length > 0) {
			// get the user name and link
			const username = $elem.find('a.bigusername').text();
			const link = $(samknowsLinks[0]).attr('href');
			const id = $elem.attr('id');

			links.push({ username, link, origin: `${uri}#${id}` });
		}
	});

	console.log(`Fetched links for ${uri}`);
	return links;
}

function firstTdText($element, $) {
	return $($element.find('td').get(0)).text().trim();
}

async function getStatistics(linkObj) {

	const { uri, username, origin } = linkObj;
	const { $ } = await Scraper().get(uri);

	// syntax will be
	// category, aggregate, amount, metric
	// e.g.
	// "Local Downstream throughput", "Average", 110.37, "Mbps"
	const daterange = $($('td[colspan="3"] h2')[0]).text().trim();
	const [, startDate, endDate] = REPORT_DATERANGE_REGEX.exec(daterange);
	const isptext = $($('td[colspan="3"] h3')[0]).text().trim();
	const isp = REPORT_ISP_REGEX.exec(isptext)[1];
	const report = { uri, username, startDate, endDate, isp, origin, stats: [] };

	console.log(JSON.stringify(report, null, 4));

	// the samknows HTML DOM structure is irritating beyond belief
	$('table[width="680"]').each(function() {
		const $table = $(this);
		const category = $table.find('h2').text();

		// retrieve the 3 different aggregates
		const $aggregates = $table.find('td[width="280"] div:nth-child(1)')
		if ($aggregates.length === 0) {
			// note: We do not proceed if there is no matching div.  i.e. we've been snooked by samknows
			console.log('Samknows decided to snook us by giving us a fake table to scrape.');
			return;
		}

		const amountTxt = $aggregates.text().trim();
		const [, amount, metric] = REPORT_MEASURE_REGEX.exec(amountTxt);

		console.log(JSON.stringify({ category, amountTxt, amount, metric }, null, 4));

		const minitables = $table.find('td[width="265"]>table>tr>td>table');
		const $mintable = $(minitables[0]);
		const $maxtable = $(minitables[1]);

		const minAmtText = firstTdText($mintable,$);
		const [, minAmount, minMetric] = REPORT_MEASURE_REGEX.exec(minAmtText);

		console.log(JSON.stringify({ minAmtText, minAmount, minMetric }, null , 4));

		var maxAmtText = firstTdText($maxtable,$);
		var [, maxAmount, maxMetric] = REPORT_MEASURE_REGEX.exec(maxAmtText);
		console.log(JSON.stringify({ maxAmtText, maxAmount, maxMetric }, null , 4));

		report.stats.push({ category, aggregate: 'Avg', amount: parseFloat(amount ? amount : 0), metric: metric});
		report.stats.push({ category, aggregate: 'Min', amount: parseFloat(minAmount ? minAmount: 0), metric: minMetric});
		report.stats.push({ category, aggregate: 'Max', amount: parseFloat(maxAmount ? maxAmount: 0), metric: maxMetric});

	});

	console.log(`Fetched statistics for ${uri}`);

	return report;
}

execute(main);