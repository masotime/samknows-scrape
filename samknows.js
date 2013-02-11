var request = require("request"),
	cheerio = require("cheerio"),
	_ = require("underscore"),
	async = require("async"),
	fs = require("fs");

// Underscore.string convenience mixins
_.str = require('underscore.string');
_.mixin(_.str.exports());

var SAMKNOWS_ROOT = "http://forums.hardwarezone.com.sg/next-generation-broadband-network-ngbn-forum-320/samknows-singapore-campaign-3684527.html"
var REPORT_DATERANGE_REGEX = /^From\s+([0-9]+\s+[a-zA-Z]+\s+[0-9]+)\s+to\s+([0-9]+\s+[a-zA-Z]+\s+[0-9]+)/
var REPORT_ISP_REGEX = /^ISP\s+\-\s+(.+)$/
var REPORT_MEASURE_REGEX = /^([0-9\.]*)([%a-zA-Z]+)/
var SAMKNOWS_LINK_SELECTOR = 'div[id^="post_message"]>a[href^="http://reporting.samknows.com/reportcard"],div[id^="post_message"]>a[href^="https://reporting.samknows.com/reportcard"]'

function fetch(uri, callback) {
	request({
		"uri": uri
	}, function(error, response, body) {
		if (error) {
			console.log('Problem fetching '+uri);
			console.log(error);
			process.exit();
		}

		callback(cheerio.load(body));

	});
}

function getReports(uri, callback) {
	fetch(uri, function($) {

		console.log('Getting links for '+uri);
		var links = [];

		// start from the outside
		$('table[id^="post"]').each(function() {
			var samknowsLinks = $(this).find(SAMKNOWS_LINK_SELECTOR);
			if (samknowsLinks.length > 0) {
				// get the user name and link
				var username = $(this).find('a.bigusername').text();
				var link = $(samknowsLinks[0]).attr('href');
				links.push({
					"username": username,
					"link": link,
					"origin": uri+'#'+$(this).attr('id')
				});
			}
		});

		console.log('Fetched links for '+uri);
		callback(null, links);
	});
}

function rExec(regex, str) {
	if (!regex.test(str)) {
		console.log('String ['+str+'] doesn\'t match regex ['+regex+']');
		process.exit();
	}

	return regex.exec(str);
}

function firstTdText($element, $) {
	var elems = $element.find('td');
	if (elems.length === 0) {
		console.log('Could not find any td in the HTML element below!');
		console.log($element);
		process.exit();
	}

	return _.trim($(elems[0]).text());
}

function getStatistics(linkObj, callback) {
	var uri = linkObj.uri;
	var username = linkObj.username;
	var origin = linkObj.origin;

	fetch(uri, function($) {
		// syntax will be
		// category, aggregate, amount, metric
		// e.g.
		// "Local Downstream throughput", "Average", 110.37, "Mbps"
		var reports = [];
		var daterange = _.trim($($('td[colspan="3"] h2')[0]).text());
		var startDate = rExec(REPORT_DATERANGE_REGEX, daterange)[1];
		var endDate = rExec(REPORT_DATERANGE_REGEX, daterange)[2];
		var isptext = _.trim($($('td[colspan="3"] h3')[0]).text());
		var isp = REPORT_ISP_REGEX.exec(isptext)[1];

		var report = {
			"uri": uri,
			"username": username,
			"startDate": startDate,
			"endDate": endDate,
			"isp": isp,
			"origin": origin,
			"stats": []
		};

		console.log(JSON.stringify(report,null,4));

		// the samknows HTML DOM structure is irritating beyond belief
		$('table[width="680"]').each(function() {

			$table = $(this);
			var category = $table.find('h2').text();

			// retrieve the 3 different aggregates
			var amountTxt = _.trim($table.find('td[width="280"] div:nth-child(1)').text());
			var amount = rExec(REPORT_MEASURE_REGEX, amountTxt)[1];
			var metric = rExec(REPORT_MEASURE_REGEX, amountTxt)[2];

			console.log('category = '+category+', amountTxt = '+amountTxt+', amount = '+amount+', metric = '+metric);

			var minitables = $table.find('td[width="265"]>table>tr>td>table');
			var $mintable = $(minitables[0]);
			var $maxtable = $(minitables[1]);

			var minAmtText = firstTdText($mintable,$);
			var minAmount = rExec(REPORT_MEASURE_REGEX,minAmtText)[1];
			var minMetric = rExec(REPORT_MEASURE_REGEX,minAmtText)[2];
			console.log('minAmtText = '+minAmtText+', minAmount = '+minAmount+', minMetric = '+minMetric);

			var maxAmtText = firstTdText($maxtable,$);
			var maxAmount = rExec(REPORT_MEASURE_REGEX,maxAmtText)[1];
			var maxMetric = rExec(REPORT_MEASURE_REGEX,maxAmtText)[2];
			console.log('maxAmtText = '+maxAmtText+', maxAmount = '+maxAmount+', maxMetric = '+maxMetric);

			report.stats.push({"category": category, "aggregate": "Avg", "amount": parseFloat(amount ? amount : 0), "metric": metric});
			report.stats.push({"category": category, "aggregate": "Min", "amount": parseFloat(minAmount ? minAmount: 0), "metric": minMetric});
			report.stats.push({"category": category, "aggregate": "Max", "amount": parseFloat(maxAmount ? maxAmount: 0), "metric": maxMetric});

		});

		console.log('Fetched statistics for '+uri);
		callback(null, report);
	});
}

var steps = [];

// STEP 1: get all the links from samknows thread
steps.push(function(callback) {
	fetch(SAMKNOWS_ROOT, function($) {
		var data = {};

		var lastLink = $('li.prevnext a[title*="Last Page"]').attr("href");
		var lastPage = parseInt(/([0-9]+)\.html$/.exec(lastLink)[1]);

		var links = [SAMKNOWS_ROOT];

		for (var i=2; i <= lastPage; i++) {
			links.push(SAMKNOWS_ROOT.replace(/\.html$/, "-"+i+".html"));
		}

		data.links = links;
		callback(null, data);
	});
});

// STEP 2: Run them all in parallel and fetch the links to each samknows report that is found
steps.push(function(data, callback) {
	console.log('All links to samknows thread interpolated. Total of '+data.links.length+' pages fetched.');

	async.map(data.links, getReports, function(err, results) {
		if (err) {
			console.log('Could not fetch samknows links from HWZ thread. '+err);
			process.exit();
		}

		// we now need to compress the links and remove duplicates.  First link takes priority.
		var reportLinks = {};
		for (var page=0; page < results.length; page++) {
			var pagelinks = results[page];
			for (var linkIdx=0; linkIdx < pagelinks.length; linkIdx++) {
				var linkData = pagelinks[linkIdx];

				// skip if it already exists
				if (!(linkData.link in reportLinks)) {
					reportLinks[linkData.link] = {
						"uri": linkData.link,
						"username": linkData.username,
						"origin": linkData.origin
					};
				}
			}
		}

		// because async only works with arrays, we convert it back to arrays
		var reportLinksArray = [];
		for (uri in reportLinks) {
			reportLinksArray.push(reportLinks[uri]);
		}

		console.log('Fetched the following user-samknows links:');
		console.log(JSON.stringify(reportLinksArray,null,4));
		callback(null, reportLinksArray);
	});
	
});

// STEP 3: Go into each report and extract individual information
steps.push(function(data, callback) {
	console.log('Now attempting to read actual Samknows reports data');
	async.map(data, getStatistics, function(err, results) {
		if (err) {
			console.log('Could not fetch samknows reports. '+err);
			process.exit();
		}

		console.log('Fetched data as follows:');
		console.log(JSON.stringify(results, null, 4));
		console.log('================');
		console.log('Writing results to file data.json');
		fs.writeFile("data.json", JSON.stringify(results,null,4), function(err) {
			if (err) {
				console.log('Failed to write data.json! Aborting...');
				process.exit();
			}
			callback(null);
		})
	});
});

async.waterfall(steps);
