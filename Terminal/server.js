(function() {

  var pty = require('pty.js');
  var app = require('http').createServer(handler)
  var io = require('socket.io')(app);
  var fs = require('fs');
  var sessions = {};

  function createSession() {

    var term = pty.spawn('bash', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });


    term.on('data', function(data) {
      var id = term.pty;
      io.emit('data', id, data);
    });

    term.on('title', function(title) {
      var id = term.pty;
      io.emit('title', id, title);
    });

    term.on('close', function() {
      var id = term.pty;
      io.emit('kill', id);

      destroySession(id);
    });

    last = term;

    return term;
  }

  function handler(req, res) {
    fs.readFile(__dirname + '/index.html',
    function (err, data) {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading index.html');
      }

      res.writeHead(200);
      res.end(data);
    });
  }

  function destroySession(id) {
    if ( sessions[id] ) {
      console.log('!!! destroying session', id);
      if ( sessions[id].term ) {
        sessions[id].term.destroy();
      }
      delete sessions[id];
    }
  };

  setInterval(function() {
    Object.keys(sessions).forEach(function(key) {
      var term = sessions[key];
      if ( term.ping ) {
        var now = Date.now();
        var sec = (now - term.ping) / 1000;
        if ( sec >= 60 ) {
          console.log('Session', key, 'timed out');
          destroySession(key);
        }
      }
    });
  }, 1000);

  io.on('connection', function (socket) {
    console.log('Incoming connection');

    //io.emit('data', '...creating shell...');

    socket.on('resize', function(id, x, y) {
      if ( arguments.length === 2 ) return;
      console.log('<<<', 'resize', id, x, y);

      var term = sessions[id];
      if ( term ) {
        term.term.resize(x, y);
      }
    });

    socket.on('process', function(id, cb) {
      //console.log('<<<', 'process', id);

      var term = sessions[id];
      if ( term ) {
        cb(false, term.term.process);
      } else {
        cb(false, 'null');
      }
    });

    socket.on('data', function (id, data) {
      var term = sessions[id];
      if ( term ) {
        term.term.write(data);
      }
    });

    socket.on('ping', function (id) {
      var now = Date.now();
      var term = sessions[id];
      if ( term ) {
        console.log('<<<', 'ping', id, now, '<-', term.ping);
        term.ping = now;
      }
    });

    socket.on('destroy', function(id) {
      console.log('<<<', 'destroy', id);
      destroySession(id);
    });

    socket.on('spawn', function(cb) {
      var term = createSession();
      var id = term.pty;

      console.log('>>>', 'spawn', id);

      sessions[id] = {
        ping: Date.now(),
        term: term
      };

      cb(id);
    });

  });

  app.listen(8080);

})();
