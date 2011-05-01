# Vanilla - a framework for Node
__Vanilla__ is another Sinatra-like framework. This is an early release, 
with polishing yet to be done. Things will change periodically.

## Install

    npm install vanilla

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


## Views

Possibly the largest difference between Vanilla and other Sinatra-clones
is with regard to how it handles views.

Vanilla favors "view inheritance" over partials for reuse of templates.

### Example:

    res.view 
      .inherits('layout.html')
      .inherits('section.html')
      .inherits('message.html') //.name('message.html')
      .local({
        title: 'Look, a view.',
        content: 'Hello world!'
      })
      .render();

#### So whats going on here?

Vanilla treats views as inheritance chains of templates, going 
top-down which is to say, from parent to child. In this example, 
message inherits section, which in turn inherits layout. They 
all share a common scope of local variables. The rendering of 
`message` is propogated upward to `section`, contained inside 
a special local variable called `body`.

Every response object has a `view` property, which 
will create a new `View` object when accessed for the first time
(the view constructor is exposed at: `Vanilla.View`).
You can access this view within the request 
handler and shape it to your liking, at which point, you can 
execute `res.view.render()`, or `res.render()` for short.

__Note:__  
You can also select a "subject" for a view by invoking `.name()`, 
this will become the child-most or least-ancestral template 
on the inheritance chain *regardless of the order it was called in*.
This is completely optional and unnecessary in most situations.

This is what the templates in the above example might look like:

`layout.html`:

    <h1><%= title %></h1>
    <%= body %>
    <footer>Bye world!</footer>

`section.html`:

    <section>
      <h2><%= title %></h2>
      <%= body %>
    </section>

`message.html`:

      <div>
        <p><%= content %></p>
      </div>

Thus rendering the final view:

    <h1>Look, a view.</h1>
    <section>
      <h2>Look, a view.</h2>
      <div>
        <p>Hello world!</p>
      </div>
    </section>
    <footer>Bye world!</footer>

`section.html` is still usable on its own as well:

    res.view
      .inherits('layout.html')
      .inherits('section.html')
      .local({ 
        title: 'Hello world', 
        body: 'look, a section'
      })
      .render();


We can also define inheritence within the template itself 
by using a simple statement:

`message.html`:

    <%= inherits("layout.html", "section.html"); %>
    <div>
      <p><%= content %></p>
    </div>

This should work with practically any templating engine. Please post an issue
if this is not the case for any particular templating engine.

The inherits helper can be called anywhere in the template (but its best to 
call it on the first line). The order matters here, just like it does on the 
View API, because it dictates the order of the inheritance chain.

Note that using the `inherits` function in a template may be slightly slower
than using the view API for it.

You will of course need to expose your templating 
engine and views directory to Vanilla:

    app.set('template', engine.compile); // your template's compile function
    app.set('views', __dirname + '/views'); // your app's views directory

Now, you might want to set a permanent layout for every view.
There is no special option for this, simply set up the inheritance
in an unconditional route:

    app.route(function(req, res) {
      res.view.inherits('layout.html');
      res.pass();
    });

### Shortcuts

    // automatically creates a view and renders it
    res.render('message', { title: 'hello world' }); 
    
    // compiles and returns an executed partial
    app.partial('message', { title: 'hello world' }); 
    
    app.show(); // same thing as above
    res.show(); // same thing as above
    res.partial(); // same thing as above except 
                   // it calls res.serve() on the output

Vanilla also has support for partials called from within templates:
`<%= partial("something.html", {data: "data"}) %>`

## Routing

Routing uses the common sinatra-like interface that everyone is used to. The 
patterns come in a slightly different flavor however. The patterns are just 
regexes represented as literal strings, with a few differences: 
- dots/periods/full-stops/whathaveyou are automatically escaped depending
- a percentage sign `(%)` can be used in place of a backslash for escaping.
- Route patterns incorporate the Google Chrome expression patterns on top of 
  this, rendering `*` a wild card sequence and square brackets `[]` a 
  conditional grouping.

### The specific API:

`app.route` adds a route handler to every HTTP method. If no route is specified,
it is matched for every route.

`app.route` is the super function in this case. `app.route` will attach a route 
to every HTTP method. It can optionally take a route pattern (or regex) as its 
first argument. If no pattern is provided, it will be unconditionally matched 
for every route. The HTTP verbs (get, post, put, etc) are all derivatives of 
the `.route` method. They have the same exact behavior except they only attach 
a route to a single method. `app.route` and its children can take an infinite 
number of arguments for the handlers that will be bound to the route.

Example:

    app.route(function(req, res) {
      console.log('this is called for every request, no matter what.');
      res.pass();
    });

    app.route('/', function(req, res) {
      console.log('this will get called for every request to "/".');
      res.pass();
    }, function(req, res) {
      console.log('so will this.');
      res.pass();
    });

    app.get('/', function(req, res) {
      console.log('this will only be called on a GET to "/".');
    });

## Request & Response

### Sessions

Vanilla comes with a built-in session system. It's very lightweight and utilizes 
the local filesystem to store sessions, so there is no need to spend time 
configuring and picking a session store. And unless you're youtube, this should 
be sufficient. It even presupposes a data directory (`__dirname + '/.sessions'`) 
within its own directory, as well as a cookie time and name, so theres very 
little to configure. 

It is also possible to set a session limit `app.set('session', {limit: ...})` to 
limit the number of sessions stored. If the number of sessions is ever exceeded, 
they will be cleaned up completely.

A lot of the middleware in Vanilla is assumed, but I think it's important to 
make sessions optional. I don't need sessions for every project, and I'm 
willing to assume other people don't either.

You can enable them with the default options by calling:
`app.set('sessions', true);`

Or you can pass in an options object:
`app.set('sessions', { life: 24 * 60 * 60 * 1000, limit: 500 })`

A user's session will get written to disk after 2 minutes of inactivity.
(I'm still uncertain how this will be done, it may change slightly.)

#### Why use the filesystem?

Because some projects don't necessarily need a database, and using a database 
for sessions alone seems a little like overkill, ...like using a sledge hammer 
to peel an orange. 

### .halt and .pass

Vanilla is very similar to Sinatra in that it supplies `.pass()` and `.halt()` 
methods. They will both immediately exit the current handler if called. 
`res.pass` is essentially an alias for `res.next()`, except `res.next` needs a 
return statement after it to produce the same behavior.

These are both available on the response object:

    // this will display a 404
    app.get('/', function(req, res) {
      res.halt(404);
      res.serve('hello'); // this never gets called
    });

    // the above could also be accomplished with "return res.error(404);"

    app.get('/*', function(req, res) {
      res.type('.txt');
      res.pass();
      console.log('this never gets called');
      res.end('this never gets called');
    }, function(req, res) {
      console.log('hello world!');
      res.serve('hello world!');
    });

    // outputs: "hello world!", "hello world!"

So, to put it simply, in the top level of a handler:
- `res.halt();` is equal to `return;`.
- `res.halt(404);` is equal to `return res.error(404);`.
- `res.pass();` is equal to `return res.next();`.

Be aware that `.halt()` and `.pass()` throw to get out of the handler. I've 
included some measures to try to ensure that they will break past user 
try/catches, but it's best to avoid using them inside try/catches. This should 
still work with things like Step which wrap everything in a try/catch, as long 
as you normally handle your errors. (This is a bit hacksy because it is misusing 
throw to a degree, but in my own tests, there hasn't been any problems 
performance-wise. It seems to work well.)

### Caching for ETags and Last-Modified:

    var relevantFile = './data.txt';
    app.get('/', function(req, res) {
      fs.stat(relevantFile, function(err, stat) {
        res.modified(stat.mtime);
        res.serve('hello world');
      });
    });

In this example, `res.modified` will set the `Last-Modified` header to the 
time(ms) or `Date` that was passed in. If the client sent an `If-Modified-Since` 
header equivalent to the time passed into `res.modified`, it will automatically 
break out of the handler via `res.halt`, calling `res.halt(304)`, in turn 
responding with a `304 Not Modified`.

There is also a `res.etag` counterpart for ETags.

## Mounting and virtual hosting:
    
    var Vanilla = require('./vanilla');
    var app = Vanilla.listen(80);
    var app2 = Vanilla();

    app.vhost('blog.mydomain.tld', app2);

    // OR:

    app.mount('/blog', app2);

## Middleware

Because the use of the router is assumed, it can be used to route middleware.
Custom middleware can be added the same way routes are added. 

    app.route(myMiddleware(options));

* * *

Vanilla assumes a number of middleware out of the box. This was a conscious 
choice and it will remain this way. It's not here to be overly modular or 
extremely loosely coupled. It includes a body parser (JSON or form-urlencoded, 
regrettably no multipart), a cookie parser, and it parses a number of headers 
to make them more usable. Much of which is documented below.

## Full API List:
- `new Application([options, func, ...])` - `options` is an HTTPS options object, 
  `func` is any number of `.route` handlers. 
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

## Notes

An important thing to know about the behavior of `.listen()`:
If `.listen()` is called on the Vanilla constructor, a new app 
object is implicitly created. A server will __only__ be created 
and bound to the specified port if the app is not mounted. This is accomplished 
by only creating an app's server once Node enters its event loop (once the main 
file is done executing). So what does this mean?

    var Vanilla = require('vanilla');

    var app = Vanilla.listen(80);
    var child = Vanilla.listen(8000);

    app.mount('/child', child); 

In the case above, `child` will not have a server created for it despite 
`listen` being called. The port passed into blog's `.listen()` is completely 
disregarded, and it inherits its parent's port/server instead.

## Problems ?
So, Vanilla uses a bunch of assumed middleware.
While this has its benefits, it also comes with some disadvantages. For example, its not 
practical to add a multipart parser, as the body parser is already assumed. It 
is also impractical to add something like a method override because the router 
is already assumed. I'm thinking of including a method override mechanism by 
default, after all, it could even be one line. It doesn't cost much.

## "Why should I use this when there is X?"

This is just my take on a sinatra clone. I originally started writing this 
because I don't feel comfortable using something unless I've written it myself 
and understand exactly whats happening behind the scenes. Using a framework 
almost makes me feel guilty for abstracting something, especially if I didn't 
do the abstracting myself. Also, having my own framework allows me to tailor 
it to my specific needs (although I do try to keep it general to a degree). I also 
wanted a framework that didn't have a fat stack of dependencies. Vanilla is 
less than 1000 lines and contained in a single file with no dependencies. It 
makes assumptions, but it's still open-ended, such that it allows custom 
middleware, custom templating engines and the rest.

So in response to this question, to put it differently:
I don't know. All I can say is, it's here for you to use if you want it. 

## Bugs?
Vanilla is still young, there's bound to be some issues with it, and I'm still 
trying to decide on how to design certain things. There will be changes here 
and there.

## License
See LICENSE (MIT).

