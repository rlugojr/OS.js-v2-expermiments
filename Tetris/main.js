/*!
 * OS.js - JavaScript Operating System
 *
 * Copyright (c) 2011-2015, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met: 
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer. 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution. 
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */
(function(Application, Window, GUI, Dialogs, Utils, API, VFS) {

  /*@
   * This is a customized version of:
   * https://github.com/jakesgordon/javascript-tetris/
   *
   * Needs a serious cleanup
   */


  function timestamp()           { return new Date().getTime();                             }
  function random(min, max)      { return (min + (Math.random() * (max - min)));            }
  function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; }
  if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
                                   window.mozRequestAnimationFrame    ||
                                   window.oRequestAnimationFrame      ||
                                   window.msRequestAnimationFrame     ||
                                   function(callback, element) {
                                     window.setTimeout(callback, 1000 / 60);
                                   }
  }

  var KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 },
      DIR     = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 },
      canvas  = null,
      ctx     = null,
      ucanvas = null,
      uctx    = null,
      paused  = false,
      start   = null,
      speed   = { start: 0.6, decrement: 0.005, min: 0.1 }, // how long before piece drops by 1 row (seconds)
      nx      = 10, // width of tetris court (in blocks)
      ny      = 20, // height of tetris court (in blocks)
      nu      = 5;  // width/height of upcoming preview (in blocks)

  var dx, dy,        // pixel size of a single tetris block
      blocks,        // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
      actions,       // queue of user actions (inputs)
      playing,       // true|false - game is in progress
      dt,            // time since starting this game
      current,       // the current piece
      next,          // the next piece
      score,         // the current score
      vscore,        // the currently displayed score (it catches up to score in small chunks - like a spinning slot machine)
      rows,          // number of completed rows in the current game
      step;          // how long before current piece drops by 1 row

  //-------------------------------------------------------------------------
  // tetris pieces
  //
  // blocks: each element represents a rotation of the piece (0, 90, 180, 270)
  //         each element is a 16 bit integer where the 16 bits represent
  //         a 4x4 set of blocks, e.g. j.blocks[0] = 0x44C0
  //
  //             0100 = 0x4 << 3 = 0x4000
  //             0100 = 0x4 << 2 = 0x0400
  //             1100 = 0xC << 1 = 0x00C0
  //             0000 = 0x0 << 0 = 0x0000
  //                               ------
  //                               0x44C0
  //
  //-------------------------------------------------------------------------
  var i = { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'   };
  var j = { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'   };
  var l = { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange' };
  var o = { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow' };
  var s = { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'  };
  var t = { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple' };
  var z = { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'    };

  //------------------------------------------------
  // do the bit manipulation and iterate through each
  // occupied block (x,y) for a given piece
  //------------------------------------------------
  function eachblock(type, x, y, dir, fn) {
    var bit, result, row = 0, col = 0, blocks = type.blocks[dir];
    for(bit = 0x8000 ; bit > 0 ; bit = bit >> 1) {
      if (blocks & bit) {
        fn(x + col, y + row);
      }
      if (++col === 4) {
        col = 0;
        ++row;
      }
    }
  }

  //-----------------------------------------------------
  // check if a piece can fit into a position in the grid
  //-----------------------------------------------------
  function occupied(type, x, y, dir) {
    var result = false
    eachblock(type, x, y, dir, function(x, y) {
      if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x,y))
        result = true;
    });
    return result;
  }
  function unoccupied(type, x, y, dir) {
    return !occupied(type, x, y, dir);
  }

  //-----------------------------------------
  // start with 4 instances of each piece and
  // pick randomly until the 'bag is empty'
  //-----------------------------------------
  var pieces = [];
  function randomPiece() {
    if (pieces.length == 0)
      pieces = [i,i,i,i,j,j,j,j,l,l,l,l,o,o,o,o,s,s,s,s,t,t,t,t,z,z,z,z];
    var type = pieces.splice(random(0, pieces.length-1), 1)[0];
    return { type: type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0 };
  }

  //-------------------------------------------------------------------------
  // GAME LOGIC
  //-------------------------------------------------------------------------

  function play() {
    if ( start ) {
      start.style.display = 'none';
    }
    reset();
    playing = true;
  }
  function lose() {
    if ( start ) {
      start.style.display = 'block';
    }
    setVisualScore();
    playing = false;
  }

  function setVisualScore(n)      { vscore = n || score; invalidateScore(); }
  function setScore(n)            { score = n; setVisualScore(n);  }
  function addScore(n)            { score = score + n;   }
  function clearScore()           { setScore(0); }
  function clearRows()            { setRows(0); }
  function setRows(n)             { rows = n; step = Math.max(speed.min, speed.start - (speed.decrement*rows)); invalidateRows(); }
  function addRows(n)             { setRows(rows + n); }
  function getBlock(x,y)          { return (blocks && blocks[x] ? blocks[x][y] : null); }
  function setBlock(x,y,type)     { blocks[x] = blocks[x] || []; blocks[x][y] = type; invalidate(); }
  function clearBlocks()          { blocks = []; invalidate(); }
  function clearActions()         { actions = []; }
  function setCurrentPiece(piece) { current = piece || randomPiece(); invalidate();     }
  function setNextPiece(piece)    { next    = piece || randomPiece(); invalidateNext(); }
  function reset() {
    dt = 0;
    clearActions();
    clearBlocks();
    clearRows();
    clearScore();
    setCurrentPiece(next);
    setNextPiece();
  }
  function update(idt) {
    if (playing && !paused) {
      if (vscore < score)
        setVisualScore(vscore + 1);
      handle(actions.shift());
      dt = dt + idt;
      if (dt > step) {
        dt = dt - step;
        drop();
      }
    }
  }
  function handle(action) {
    switch(action) {
      case DIR.LEFT:  move(DIR.LEFT);  break;
      case DIR.RIGHT: move(DIR.RIGHT); break;
      case DIR.UP:    rotate();        break;
      case DIR.DOWN:  drop();          break;
    }
  }
  function move(dir) {
    var x = current.x, y = current.y;
    switch(dir) {
      case DIR.RIGHT: x = x + 1; break;
      case DIR.LEFT:  x = x - 1; break;
      case DIR.DOWN:  y = y + 1; break;
    }
    if (unoccupied(current.type, x, y, current.dir)) {
      current.x = x;
      current.y = y;
      invalidate();
      return true;
    }
    else {
      return false;
    }
  }
  function rotate() {
    var newdir = (current.dir == DIR.MAX ? DIR.MIN : current.dir + 1);
    if (unoccupied(current.type, current.x, current.y, newdir)) {
      current.dir = newdir;
      invalidate();
    }
  }
  function drop() {
    if (!move(DIR.DOWN)) {
      addScore(10);
      dropPiece();
      removeLines();
      setCurrentPiece(next);
      setNextPiece(randomPiece());
      clearActions();
      if (occupied(current.type, current.x, current.y, current.dir)) {
        lose();
      }
    }
  }
  function dropPiece() {
    eachblock(current.type, current.x, current.y, current.dir, function(x, y) {
      setBlock(x, y, current.type);
    });
  }
  function removeLines() {
    var x, y, complete, n = 0;
    for(y = ny ; y > 0 ; --y) {
      complete = true;
      for(x = 0 ; x < nx ; ++x) {
        if (!getBlock(x, y))
          complete = false;
      }
      if (complete) {
        removeLine(y);
        y = y + 1; // recheck same line
        n++;
      }
    }
    if (n > 0) {
      addRows(n);
      addScore(100*Math.pow(2,n-1)); // 1: 100, 2: 200, 3: 400, 4: 800
    }
  }
  function removeLine(n) {
    var x, y;
    for(y = n ; y >= 0 ; --y) {
      for(x = 0 ; x < nx ; ++x)
        setBlock(x, y, (y == 0) ? null : getBlock(x, y-1));
    }
  }
  //-------------------------------------------------------------------------
  // RENDERING
  //-------------------------------------------------------------------------
  var invalid = {};
  function invalidate()         { invalid.court  = true; }
  function invalidateNext()     { invalid.next   = true; }
  function invalidateScore()    { invalid.score  = true; }
  function invalidateRows()     { invalid.rows   = true; }
  function drawCourt() {
    if (invalid.court) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (playing)
        drawPiece(ctx, current.type, current.x, current.y, current.dir);
      var x, y, block;
      for(y = 0 ; y < ny ; y++) {
        for (x = 0 ; x < nx ; x++) {
          if (block = getBlock(x,y))
            drawBlock(ctx, x, y, block.color);
        }
      }
      ctx.strokeRect(0, 0, nx*dx - 1, ny*dy - 1); // court boundary
      invalid.court = false;
    }
  }
  function drawNext() {
    if (invalid.next) {
      var padding = (nu - next.type.size) / 2; // half-arsed attempt at centering next piece display
      uctx.save();
      uctx.translate(0.5, 0.5);
      uctx.clearRect(0, 0, nu*dx, nu*dy);
      drawPiece(uctx, next.type, padding, padding, next.dir);
      uctx.strokeStyle = 'black';
      uctx.strokeRect(0, 0, nu*dx - 1, nu*dy - 1);
      uctx.restore();
      invalid.next = false;
    }
  }
  function drawPiece(ctx, type, x, y, dir) {
    eachblock(type, x, y, dir, function(x, y) {
      drawBlock(ctx, x, y, type.color);
    });
  }
  function drawBlock(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x*dx, y*dy, dx, dy);
    ctx.strokeRect(x*dx, y*dy, dx, dy)
  }

  /////////////////////////////////////////////////////////////////////////////
  // WINDOWS
  /////////////////////////////////////////////////////////////////////////////

  var ApplicationTetrisWindow = function(app, metadata) {
    Window.apply(this, ['ApplicationTetrisWindow', {
      icon: metadata.icon,
      title: metadata.name,
      width: 455,
      height: 600,
      allow_resize: false,
      allow_maximize: false
    }, app]);

    this.$score = null;
    this.$rows = null;
  };

  ApplicationTetrisWindow.prototype = Object.create(Window.prototype);

  ApplicationTetrisWindow.prototype.init = function(wmRef, app) {
    var root = Window.prototype.init.apply(this, arguments);

    var container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.right = '0px';
    container.style.top = '160px';
    container.style.width = '150px';
    container.style.overflow = 'visible';
    container.style.fontSize = '150%';

    var score = document.createElement('div');
    score.style.fontWeight = 'bold';
    score.innerHTML = 'Score';
    container.appendChild(score);

    this.$score = document.createElement('div');
    this.$score.style.marginBottom = '10px';
    container.appendChild(this.$score);

    var rows = document.createElement('div');
    rows.style.fontWeight = 'bold';
    rows.innerHTML = 'Rows';
    container.appendChild(rows);

    this.$rows = document.createElement('div');
    container.appendChild(this.$rows);

    canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 600;
    canvas.style.background = '#fff';
    ctx = canvas.getContext('2d');
    root.appendChild(canvas);

    ucanvas = document.createElement('canvas');
    ucanvas.width = 150;
    ucanvas.height = 150;
    ucanvas.style.background = '#fff';
    ucanvas.style.position = 'absolute';
    ucanvas.style.top = '0px';
    ucanvas.style.right = '0px';
    uctx = ucanvas.getContext('2d');
    root.appendChild(ucanvas);
    root.appendChild(container);

    start = document.createElement('div');
    start.style.position = 'absolute';
    start.style.top = '200px';
    start.style.left = '10px';
    start.style.right = '10px';
    start.style.bottom = '200px';
    start.style.zIndex = 100;
    start.style.border = '1px solid #222';
    start.style.background = '#e6e6e6';
    start.style.lineHeight = '200px';
    start.style.textAlign = 'center';
    start.style.fontSize = '200%';
    start.style.fontWeight = 'bold';
    start.style.opacity = .95;
    start.innerHTML = 'Press SPACE to start';
    root.appendChild(start);

    return root;
  };

  ApplicationTetrisWindow.prototype._inited = function() {
    Window.prototype._inited.apply(this, arguments);

    var self = this;
    var last = now = timestamp();

    function draw() {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.translate(0.5, 0.5); // for crisp 1px black lines
      drawCourt();
      drawNext();
      self.drawScore();
      self.drawRows();
      ctx.restore();
    }

    function frame() {
      now = timestamp();
      update(Math.min(1, (now - last) / 1000.0)); // using requestAnimationFrame have to be able to handle large delta's caused when it 'hibernates' in a background or non-visible tab
      if ( !paused ) {
        draw();
      }
      last = now;
      requestAnimationFrame(frame, canvas);
    }

    this._onResize(); // setup all our sizing information
    reset();  // reset the per-game variables
    frame();  // start the first frame
  };

  ApplicationTetrisWindow.prototype._onKeyEvent = function(ev, type) {
    if ( type === 'keydown' ) {
      var handled = false;
      if (playing) {
        switch(ev.keyCode) {
          case KEY.LEFT:   actions.push(DIR.LEFT);  handled = true; break;
          case KEY.RIGHT:  actions.push(DIR.RIGHT); handled = true; break;
          case KEY.UP:     actions.push(DIR.UP);    handled = true; break;
          case KEY.DOWN:   actions.push(DIR.DOWN);  handled = true; break;
          case KEY.ESC:    lose();                  handled = true; break;
        }
      }
      else if (ev.keyCode == KEY.SPACE) {
        play();
        handled = true;
      }
      if (handled)
        ev.preventDefault(); // prevent arrow keys from scrolling the page (supported in IE9+ and all other browsers)
    }
  };

  ApplicationTetrisWindow.prototype._onResize = function() {
    canvas.width   = canvas.clientWidth;  // set canvas logical size equal to its physical size
    canvas.height  = canvas.clientHeight; // (ditto)
    ucanvas.width  = ucanvas.clientWidth;
    ucanvas.height = ucanvas.clientHeight;
    dx = canvas.width  / nx; // pixel size of a single tetris block
    dy = canvas.height / ny; // (ditto)
    invalidate();
    invalidateNext();
  };

  ApplicationTetrisWindow.prototype.destroy = function() {
    if ( canvas && canvas.parentNode ) {
      canvas.parentNode.removeChild(canvas);
    }
    canvas = null;

    if ( ucanvas && ucanvas.parentNode ) {
      ucanvas.parentNode.removeChild(ucanvas);
    }
    ucanvas = null;

    this.$score = null;
    this.$rows = null;

    Window.prototype.destroy.apply(this, arguments);
  };

  ApplicationTetrisWindow.prototype._focus = function() {
    if ( Window.prototype._focus.apply(this, arguments) === true ) {
      paused = false;
      return false;
    }
    return true;
  };

  ApplicationTetrisWindow.prototype._blur = function() {
    if ( Window.prototype._blur.apply(this, arguments) === true ) {
      paused = true;
      return false;
    }
    return true;
  };

  ApplicationTetrisWindow.prototype.drawRows  = function() {
    if (invalid.rows) {
      this.$rows.innerHTML = rows.toString();
    }
  };

  ApplicationTetrisWindow.prototype.drawScore = function() {
    if (invalid.score) {
      this.$score.innerHTML = ("00000" + Math.floor(vscore)).slice(-5);
      invalid.score = false;
    }
  };

  /////////////////////////////////////////////////////////////////////////////
  // APPLICATION
  /////////////////////////////////////////////////////////////////////////////

  var ApplicationTetris = function(args, metadata) {
    Application.apply(this, ['ApplicationTetris', args, metadata]);
  };

  ApplicationTetris.prototype = Object.create(Application.prototype);

  ApplicationTetris.prototype.destroy = function() {
    return Application.prototype.destroy.apply(this, arguments);
  };

  ApplicationTetris.prototype.init = function(settings, metadata) {
    Application.prototype.init.apply(this, arguments);
    this._addWindow(new ApplicationTetrisWindow(this, metadata));
  };

  ApplicationTetris.prototype._onMessage = function(obj, msg, args) {
    Application.prototype._onMessage.apply(this, arguments);
    if ( msg == 'destroyWindow' && obj._name === 'ApplicationTetrisWindow' ) {
      this.destroy();
    }
  };

  //
  // EXPORTS
  //
  OSjs.Applications = OSjs.Applications || {};
  OSjs.Applications.ApplicationTetris = OSjs.Applications.ApplicationTetris || {};
  OSjs.Applications.ApplicationTetris.Class = ApplicationTetris;

})(OSjs.Core.Application, OSjs.Core.Window, OSjs.GUI, OSjs.Dialogs, OSjs.Utils, OSjs.API, OSjs.VFS);
