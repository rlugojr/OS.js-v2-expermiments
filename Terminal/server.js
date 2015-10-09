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
      io.emit('data', data);
    });

    term.on('title', function(title) {
      io.emit('title', title);
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
      sessions[id].term.destroy();
      delete sessions[id];
    }
  };

  setInterval(function() {
    var now = new Date();
    Object.keys(sessions).forEach(function(key) {
      var term = sessions[key];
      if ( term.ping ) {
        var sec = now - term.ping;
        if ( sec >= 60 ) {
          console.log('Session', key, 'timed out');
          destroySession(key);
        }
      }
    });
  }, 5000);

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
      //console.log('<<<', 'ping', id);
      var term = sessions[id];
      if ( term ) {
        term.ping = new Date();
      }
    });

    socket.on('destroy', function(id) {
      console.log('<<<', 'destroy', id);
      destroySession(id);
    });

    var term = createSession();
    var id = term.pty;
    socket.emit('id', id);
    sessions[id] = {
      ping: new Date(),
      term: term
    }
  });

  app.listen(8080);

})();
