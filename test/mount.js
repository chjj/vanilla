var Vanilla = require('../');var app = Vanilla.listen(8080); var app2 = new Vanilla();app.mount('/test', app2);app.get('/', function(req, res, next) {  res.serve('hello world');});app2.get('/', function(req, res, next) {  res.serve('hi world');});