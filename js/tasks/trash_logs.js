var fs = require('fs');
var jobNames = [
	'contineously_com_m',
	'monthly_com_m',
	'weekly_com_m',
	'daily_com_m',
	'testly_com_m'
];
console.log('cleaning up logs');
jobNames.forEach(function(jobName) {
	// Asynchroneously unlink files
	fs.unlink(jobName + '.out');
	fs.unlink(jobName + '.err');
});