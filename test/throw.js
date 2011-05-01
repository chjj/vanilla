// testing if throw is a viable option
// to break out of handler

process.on('uncaughtException', function(err) {
  if (typeof err === 'function') {
    err();
  } else { 
    console.log(err.stack || err + '');
    process.exit(1);
  }
});

var _throw = function(func) {
  throw func;
};

var _return = function() {
  return true;
};

var runReturn = function(next) {
  var a = 'hello';
  if (_return()) { 
    return process.nextTick(next);
  }
  a = 'hi';
};

var runThrow = function(next) {
  var a = 'hello';
  _throw(function() { 
    process.nextTick(next); 
  });
  a = 'hi';
};

var runStack = function(stack, done) {
  var i = 0;
  (function next() {
    if (stack[i]) {
      stack[i++](next);
    } else { 
      done();
    }
  })();
};

var createStack = function(func) {
  var i = 10000, a = [];
  while (i--) a.push(func);
  return a;
};

(function() {
  var start = Date.now();
  var stack = createStack(runReturn);
  runStack(stack, function() {
    console.log('done return:', Date.now() - start);
  });
})();

(function() {
  var start = Date.now();
  var stack = createStack(runThrow);
  runStack(stack, function() {
    console.log('done throw:', Date.now() - start);
  });
})();
