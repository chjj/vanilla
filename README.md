# Vanilla - a framework for node.js
__Vanilla__ is another sinatra-like framework. It's what I've been using 
personally. I wrote it for myself. If you choose to use it, don't expect it to
be overly modular. It makes a few assumptions regarding middleware, among other 
things. However, I still try to keep it malleable to a degree.

## Install

    $ npm install vanilla

## Usage

    var app = require('vanilla').listen(80);
    
    app.get('/', function(req, res) {
      res.modified(Date.now());
      res.view 
        .inherits('layout.html')
        .inherits('section.html')
        .local('content', 'hello!')
        .render();
    });

## Reference:
- `new Application([options, func, ...])` - `options` is an HTTPS options object, 
  `func` is any number of `.route` handlers. 
- `Application::config([env], func)` - Configure based on environment, similar 
  to Sinatra's `configure`.
- `Application::set(option, val)`
  Can be used to configure settings:
  - `error`: A custom error handler. Called as a result of res.error(). 
    Get's passed an `Error` with HTTP error semantics.
  - `template`: A template engine's `compile` function.
  - `root`: The root directory. `process.cwd()` by default.
  - `views`: The view directory. `process.cwd() + '/views'` by default
  - `charset`: The charset to `.serve` text content with. `utf-8` by default.
  - `limit`: The limit for the body in bytes. `30720 (30kb)` by default.
  - `lang`: The default language tag for the `Content-Language` header. `en` by 
    default.
  - `halt`: Halt on cache functions (`res.modified` and `res.etag`) if the 
    response should be stale. Otherwise, `res.modified` and `res.etag` 
    will send a 304 and return true. `if (res.etag(time)) return;`. 
    True by default.
  - `sessions`: Enable sessions.
  - `static`: Set the static/public directory to serve files from.
  - Anything else, accessible from `app.cfg`.
- `Application::vhost(host, app)` 
- `Application::mount(route, app)`
- `Application::listen(port[, host])`
- `Application::route([route, ]handler[, ...])`
- `Application::get, post, etc...`

- `Application::host` - The host input in the `.listen` call.
- `Application::port` - The port.
- `Application::url` - The url of the app, e.g: `http://127.0.0.1:8080`
- `Application::parent` - A reference to the parent app on which it is mounted.
- `Application::server` - The actual HTTP(S) server object.
- `Application::https` - A reference to the HTTPS options object.
- `Application::dev` - Development environment
- `Application::env` - Environment.

- `new View(app[, name])` - `app` is a reference to an app (so it knows which 
  template engine to use).
- `View::local(name[, val])` - Sets a local variable, can also take an object 
  to set multiple locals.
- `View::inherits(name)` - Have the view inherit a template.
- `View::drop(name)` - Have the view remove a template from the inheritance 
  chain.
- `View::name(name)` - The child-most inherited template, or the "subject". 
  (Not necessary for rendering views).
- `View::show(name[, locals])` - Return a rendered template in a string.
- `Response::view.render(name[, locals])` - The same thing as `View.show`, 
  except it serves a response.

- `Response::error(code[, body, ...])` - Responds with with an HTTP error.
- `Response::cookie(name, val[, options/expires])` - Get/Set a cookie. Clear a 
   cookie by setting `val` to null.
- `Response::serve(data[, func])` - Serve a response with default headers. 
  `data` can be an object, buffer, or text. It sends JSONP if there is a 
  `callback` query field. Executes `func` once all data is flushed 
  to the socket.
- `Response::send(file[, func])` - Pipe `file` to the response. Relative to root. 
  Automatically ETagged. Supports the `Range` header. Executes `func` 
  on completion.
- `Response::redirect(url[, code])` - Redirect. Resolves relative to the app's 
  url if necessary.
- `Response::type(tag)` - Set the response content type with a mime type lookup.
- `Response::etag(entity[, weak])` - Set the `ETag` header to the specified 
  entity and call `.halt(304)` if it matches the req etag.
- `Response::modified(Date)` - Set `Last-Modified` to `Date` and call 
  `.halt(304)` if it matches the req `If-Modified-Since`.
- `Response::attach([file, func])` - The same thing as `.send`, but it sets the 
  `Content-Disposition` header to `attachment`. Callback on complete.
- `Response::cache(...)` - Set the `Cache-Control` header. Can take an 
  options object or `true`/`false`. To be documented.
- `Response::halt([code])` - Immediately exit the current handler and 
  optionally respond with an http error.
- `Response::pass()` - Immediately exit the current handler and pass control 
  to the next handler.
- `Response::header(name[, val])` - Get or set a header.
- `Response::next()` - Call the next handler.
- `Response::view` - See above.

- `Request::is(tag)` - Check a request's mime type by file extension or type.
- `Request::header(name)` - Get a request header, referer will fallback to the 
  app's url, otherwise the empty string.
- `Request::cookie(name)` - Get a cookie, fallback to the empty string.
- `Request::session` - The request's session object.
- `Request::path` - The request path in an array, e.g. [ 'path', 'to', ... ]
- `Request::pathname` - The request path.
- `Request::etag` - The request's `If-None-Match` header stripped of quotes.
- `Request::modified` - A Date object constructed from the request's 
  `If-Modified-Since` header.
- `Request::body` - The request body. This will either be the raw body in a 
  string, or an object if it is JSON/urlencoded.
- `Request::params` - The result of the params designated in the route pattern.
- `Request::host` - The request line's host (they exist!). Fallback to the 
  `Host` header. If it wasn't sent, fallback to `app.host`.
- `Request::query` - The parsed query string in an object.
- `Request::cookies` - The cookies sent with the request.
- `Request::type` - The request's content-type, stripped of charset.
- `Request::xhr` - Whether the request was initiated by an XHR.
- `Request::gzip` - Whether the requesting client accepts Gzip.

## License
See LICENSE (MIT).
