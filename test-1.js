var request = require("request");
var cheerio = require("cheerio");
var _ = require("underscore");

request(
	{ 
		uri: "http://forums.hardwarezone.com.sg/hardware-clinic-2/"
	},
	function(error, response, body) {
		var $ = cheerio.load(body);
		$("tbody#threadbits_forum_2 tr:not(.hwz-sticky) a[id*='thread_title']").each(function() {
			console.log($(this).text())
			//$(this).find("a[id*='thread_title']").each(function() {
				//console.log('Anchor found with text = '+$(this).text());
				//console.log('Anchor id = '+$(this).attr('id'));
			//});
		});
/*
		$('tbody#threadbits_forum_2 tr:not(.hwz-sticky)').find("a[id*='thread_title']").each(function() {
			//var $a = $(this);
			//console.log($a.text());
			console.log('found');
		});
*/
	}
);