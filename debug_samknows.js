// tests only the annoying samknows report HTML

var request = require("request"),
	cheerio = require("cheerio"),
	_ = require("underscore"),
	async = require("async");

// Underscore.string convenience mixins
_.str = require('underscore.string');
_.mixin(_.str.exports());

var SAMKNOWS_REPORT = "https://reporting.samknows.com/reportcard/html/33645/2012110120121130/d2e3c20d0abc7b107302fadd32afff85"
var HWZ_POST = "http://forums.hardwarezone.com.sg/next-generation-broadband-network-ngbn-forum-320/samknows-singapore-campaign-3684527-52.html"

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

fetch(HWZ_POST, function($) {
	$('table[id^="post"]').each(function() {
		var samknowsLinks = $(this).find(SAMKNOWS_LINK_SELECTOR);
		if (samknowsLinks.length > 0) {
			// get the user name and link
			var username = $(this).find('a.bigusername').text();
			var link = $(samknowsLinks[0]).attr('href');
			links.push({
				"username": username,
				"link": link
			});
		}
	});	
});

process.exit();

fetch(SAMKNOWS_REPORT, function($) {
	var daterange = _.trim($($('td[colspan="3"] h2')[0]).text());
	var startMonth = /^From\s+([0-9]+\s+[a-zA-Z]+\s+[0-9]+)\s+to\s+([0-9]+\s+[a-zA-Z]+\s+[0-9]+)/.exec(daterange);

	console.log(daterange);
	console.log(startMonth);
	console.log('========');

	var isptext = _.trim($($('td[colspan="3"] h3')[0]).text());
	var isp = /^ISP\s+\-\s+([^ ]+)/.exec(isptext)[1];

	console.log(isp);

	process.exit();

	$('table[width="680"]').each(function() {
		var $table = $(this);
		var minitables = $table.find('td[width="265"]>table>tr>td>table');

		console.log('Tables found: ' + minitables.length);
		for (idx in minitables) {
			console.log($(minitables[idx]).html());
			console.log('=============');
		}

		process.exit();
		
		// var $mintable = $(minitables[0]);
		// var $maxtable = $(minitables[1]);

	});
});