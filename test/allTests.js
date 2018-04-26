const expect = require('chai').expect;

const sinon = require('sinon');

const WebSocket = require('ws');
global.WebSocket = WebSocket;

const WebSocketServer = require('ws').Server;

const anyMessageText = 'hello';

const PORT = 50123;
const URL = `ws://localhost:${PORT}`;

var wss = null;
var cws = null;

afterEach(function () {
    close(wss, cws);
});

var instances = [
    {cws: require('../custom-websocket.js'), description: 'normal version'},
    {cws: require('../custom-websocket.min.js'), description: 'minified version'}
];

instances.forEach(function (instance) {

    describe('custom-websocket: ' + instance.description, function () {

        const CustomWebSocket = instance.cws;

        it('send text, receive and close with default options', function (done) {

            wss = new WebSocketServer({port: PORT});

            wss.on('connection', function connection(ws, req) {
                ws.on('message', function incoming(message) {
                    ws.send("SERVER_SAYS:" + message); // server send back the message it received with prefix "SERVER_SAYS:"
                });
            });

            cws = new CustomWebSocket(URL);

            expect(cws.readyState).to.be.equal(WebSocket.CONNECTING);

            cws.addEventListener('open', function(event) {
                expect(cws.readyState).to.be.equal(WebSocket.OPEN);
                cws.send(anyMessageText);
            });

            cws.addEventListener('message', function(event) {
                expect(event.data).to.match(new RegExp("^SERVER_SAYS:(" + anyMessageText + "|PING)$"));
                cws.close();
            });

            cws.addEventListener('close', function(event) {
                expect(cws.readyState).to.be.equal(WebSocket.CLOSED);
                done();
            });

        });

        it('ping (heartbeat)', function (done) {

            wss = new WebSocketServer({port: PORT});

            wss.on('connection', function connection(ws, req) {
                ws.on('message', function incoming(message) {
                    ws.send("SERVER_SAYS:" + message); // server send back the message it received with prefix "SERVER_SAYS:"
                });
            });

            cws = new CustomWebSocket(URL, null, {heartbeatInterval: 3000});

            cws.addEventListener('message', function(event) {
                expect(event.data).to.match(new RegExp("^SERVER_SAYS:PING$"));
                done();
            });

        }).timeout(6000); // timeout 2x heartbeatInterval to ensure

        it('reconnect - with default options', function (done) {

            wss = new WebSocketServer({port: PORT});
            cws = new CustomWebSocket(URL);

            var firstConnection = true;
            cws.addEventListener('open', function(event) {
                if (firstConnection) {
                    firstConnection = false;
                    wss.close();
                } else { // if second connection, then it was reconnected
                    done();
                }
            });

            var attempt = 0;
            cws.addEventListener('error', function(event) {
                if (++attempt == 3) { // to simulate the server back
                    wss = new WebSocketServer({port: PORT});
                }
            });

        }).timeout(10000);

        it('reconnect - with shouldReconnect as number', function (done) {

            wss = new WebSocketServer({port: PORT});
            cws = new CustomWebSocket(URL, null, {shouldReconnect: 1500});
            var previousTime = null;
            var firstConnection = true;

            cws.addEventListener('open', function(event) {
                if (firstConnection) {
                    firstConnection = false;
                    wss.close();
                    previousTime = Date.now();
                } else { // if second connection, then it was reconnected
                    done();
                }
            });

            var attempt = 0;
            cws.addEventListener('error', function(event) {
                var waited = Date.now() - previousTime;
                expect(waited).to.be.closeTo(1400, 1600); // because shouldReconnect is 1500 ms
                previousTime = Date.now();
                if (++attempt == 3) { // to simulate the server coming back
                    wss = new WebSocketServer({port: PORT});
                }
            });

        }).timeout(10000);

        it('automaticOpen = false, check if connected', function (done) {

            wss = new WebSocketServer({port: PORT});
            cws = new CustomWebSocket(URL, null, {automaticOpen: false});

            cws.addEventListener('open', function(event) {
                expect.fail("passed here", "should not passed here");
            });

            // TODO: assert readyState = -1 ?
            // For this, readyState in custom-websocket.js instead begin with
            // "this.readyState = WebSocket.CONNECTING;" should be start with -1
            // and inside "this.open = function () {" one of the first things
            // should be set "this.readyState = WebSocket.CONNECTING;"

            setTimeout(function() {
                var badFn = function () { cws.send(anyMessageText); };
                expect(badFn).to.throw();
                done();
            } , 3000);

        }).timeout(6000);

        it('automaticOpen = false, manual connect', function (done) {

            wss = new WebSocketServer({port: PORT});
            cws = new CustomWebSocket(URL, null, {automaticOpen: false});

            cws.addEventListener('open', function(event) {
                var goodFn = function () { cws.send(anyMessageText); };
                expect(goodFn).to.not.throw();
            });

            cws.open();

            done();

        });

        it('no ping (heartbeat = false)', function (done) {

            wss = new WebSocketServer({port: PORT});

            wss.on('connection', function connection(ws, req) {
                ws.on('message', function incoming(message) {
                    ws.send("SERVER_SAYS:" + message); // server send back the message it received with prefix "SERVER_SAYS:"
                });
            });

            cws = new CustomWebSocket(URL, null, {heartbeat: false, heartbeatInterval: 1000});

            var timeout = setTimeout(function() {
                done();
            } , 3000); // time sufficient to client send a PING, but in this test this should not happen

            cws.addEventListener('message', function(event) {
                clearTimeout(timeout); // not necessary wait timeout because this test has already failed here
                done();
                expect.fail("received this message: " + event.data, "should not have received any message");
            });

        }).timeout(4000); // timeout 4x heartbeatInterval to ensure

        it('debug = true', function (done) {

            let spy = sinon.spy(console, 'debug');
            wss = new WebSocketServer({port: PORT});

            wss.on('connection', function connection(ws, req) {
                ws.on('message', function incoming(message) {
                    ws.send("SERVER_SAYS:" + message); // server send back the message it received with prefix "SERVER_SAYS:"
                });
            });

            cws = new CustomWebSocket(URL, null, {debug: true});

            cws.addEventListener('open', function(event) {
                cws.send(anyMessageText);
            });

            cws.addEventListener('message', function(event) {
                cws.close();
            });

            cws.addEventListener('close', function(event) {
                expect( console.debug.callCount ).to.equal(6); // console.debug must be called 6 times by API
                spy.restore();
                done();
            });

        });

    });

});

function close(wss, cws) {
    wss.close();
    if (cws) {
        cws.close();
    }
}
