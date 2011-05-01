// my own personal fork of expresso.
// basically just expresso stripped 
// down and made into a module
var assert = require('expresso-mod');

var vanilla = require('./vanilla');

var app = vanilla.listen(8000);
var app2 = new vanilla;

var app3 = vanilla.listen(9000);
app3.vhost('127', (new vanilla()).get('/', function(req, res) {
  res.serve('vhost');
}));

app.set('root', __dirname);
app.set('views', __dirname + '/views');
app.set('template', function(str) {
  return function(locals) {
    return str + JSON.stringify(locals);
  };
});

app.get('/hello', function(req, res) {
  res.serve('hello world');
});

app2.get('/', function(req, res) {
  res.serve('mounted');
});

app.mount('/mount', app2);


app.get('/cookie', function(req, res) {
  res.cookie('hello', 'world', 100 * 1000);
  res.serve('');
});

app.get('/jsonp', function(req, res) {
  res.serve({hello: 'world'});
});

app.get('/file', function(req, res) {
  res.send('test.js');
});

app.get('/halt', function(req, res) {
  res.serve('test');
  try {
    res.halt(400);
  } catch(e) {
    console.log(e); // this shouldnt get output
  }
  throw new Error('You shouldn\'t see this. Halt failed.');
});

app.get('/pass', function(req, res, next) {
  next();
}).get('/pass', function(req, res, next) {
  res.serve('passed');
});

app.get('/cache', function(req, res) {
  if (res.etag('test')) return;
  res.serve('bad');
});

app.set('sessions', true);
app.get('/session', function(req, res) {
  res.serve('');
});

// need to throw it in a next tick because
// vanilla only starts the server once node 
// enters the event loop
process.nextTick(function() {
  // test implicit error
  assert.response(app.server, { url: '/bad' }, { 
    status: 404 
  });
  
  // basic message
  assert.response(app.server, { url: '/hello' }, { 
    body: 'hello world' 
  });
  
  // test sessions / cookies
  assert.response(app.server, { url: '/session' }, function(res) {
    var cookie = res.headers['set-cookie'].match(/sid=[^;]+/)[0];
    assert.ok(res.headers['set-cookie'].indexOf('sid=') !== -1);
    assert.response(app.server, { 
      url: '/session',
      headers: { 'Cookie': cookie }
    }, function(res) {
      assert.ok(!res.headers['set-cookie']);
    });
  });
  
  // test only cookies
  assert.response(app.server, { url: '/cookie' }, function(res) {
    assert.ok(res.headers['set-cookie'].indexOf('hello=world') !== -1);
  });
  
  // test JSONP
  assert.response(app.server, { url: '/jsonp?callback=test' }, { 
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    body: 'test({"hello":"world"})'
  });
  
  // test static file serving
  assert.response(app.server, { url: '/file' }, { 
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  });
  
  // test halt - make sure it actually halts
  assert.response(app.server, { url: '/halt' }, { status: 400 });
  
  // test mounting
  assert.response(app.server, { url: '/mount' }, { body: 'mounted' });
  
  // test passing
  assert.response(app.server, { url: '/pass' }, { body: 'passed' });
  
  // test caching functions
  assert.response(app.server, { url: '/cache', headers: { 'If-None-Match': 'test' } }, { status: 304 });
  
  // test vhosting
  assert.response(app3.server, { url: '/' }, { body: 'vhost' });
});
