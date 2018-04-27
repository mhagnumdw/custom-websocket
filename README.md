# custom-websocket

A small JavaScript library that decorates the WebSocket API to provide a WebSocket reconnection

[![Travis CI Build Status](https://travis-ci.org/mhagnumdw/custom-websocket.png)](https://travis-ci.org/mhagnumdw/custom-websocket)
[![Coverage Status](https://coveralls.io/repos/github/mhagnumdw/custom-websocket/badge.svg?branch=master)](https://coveralls.io/github/mhagnumdw/custom-websocket?branch=master)

It is API compatible, so when you have:

```javascript
var ws = new WebSocket('ws://....');
```

you can replace with:

```javascript
var ws = new CustomWebSocket('ws://....');
```

How reconnections occur
-----------------------

With the standard `WebSocket` API, the events you receive from the WebSocket instance are typically:

    onopen
    onmessage
    onmessage
    onmessage
    onclose // At this point the WebSocket instance is dead.

With a `CustomWebSocket`, after an `onclose` event is called it will automatically attempt to reconnect. In addition, a connection is attempted repeatedly (according a function ou number of milliseconds to pause) until it succeeds. So the events you receive may look something more like:

    onopen
    onmessage
    onmessage
    onmessage
    onclose
    // CustomWebSocket attempts to reconnect
    onopen
    onmessage
    onmessage
    onmessage
    onclose
    // CustomWebSocket attempts to reconnect
    onopen
    onmessage
    onmessage
    onmessage
    onclose

This is all handled automatically for you by the library.

## Parameters

```javascript
var socket = new CustomWebSocket(url, protocols, options);
```

#### `url`
- The URL you are connecting to.
- https://html.spec.whatwg.org/multipage/comms.html#network

#### `protocols`
- Optional string or array of protocols per the WebSocket spec.
- https://tools.ietf.org/html/rfc6455

#### `options`
- Options (see below)

## Options

Options can either be passed as the 3rd parameter upon instantiation or set directly on the object after instantiation:

```javascript
var socket = new CustomWebSocket(url, null, { debug: true });
var socket = new CustomWebSocket(url, null, { debug: true, heartbeatInterval: 120000 });
var socket = new CustomWebSocket(URL, null, {shouldReconnect: 1500}); // or a function, see below
var socket = new CustomWebSocket(URL, null, {
        shouldReconnect: function(event, attempts) {
            if (attempts > 10) attempts = 10;
            return Math.pow(1.5, attempts) * 500;
        }
    });
```

or

```javascript
var socket = new CustomWebSocket(url);
socket.debug = true;
socket.heartbeatInterval = 120000;
socket.shouldReconnect = 1500;
```

#### `debug`
- Whether this instance should log debug messages or not. Debug messages are printed to `console.debug()`.
- Accepts `true` or `false`
- Default value: `false`

#### `automaticOpen`
- Whether or not the websocket should attempt to connect immediately upon instantiation. The socket can be manually opened or closed at any time using ws.open() and ws.close().
- Accepts `true` or `false`
- Default value: `true`

#### `heartbeat`
- If true send a ping to the server. Accepts true or false.
- Accepts `true` or `false`
- Default value: `true`

#### `heartbeatInterval`
- Ping interval in milliseconds.
- Accepts `integer`
- Default: `60000` ms

#### `shouldReconnect`
- A function that, given a CloseEvent, will return the number of milliseconds to wait to reconnect. Or simply the number of milliseconds. If null to not reconnect.
- Accepts `function` or `integer` or `null`
- Default: exponential function:
```javascript
function(event, attempts) {
    if (attempts > 10) attempts = 10;
    return Math.pow(1.5, attempts) * 500;
}
```

#### `binaryType`
- The binary type is required by some applications.
- Accepts strings `'blob'` or `'arraybuffer'`.
- Default: `'blob'`

---

## Methods

#### `ws.open()`
- Open the Reconnecting Websocket

#### `ws.close(code, reason)`
- Closes the WebSocket connection or connection attempt, if any. If the connection is already CLOSED, this method does nothing.
- `code` is optional the closing code (default value 1000). [https://tools.ietf.org/html/rfc6455#section-7.4.1](https://tools.ietf.org/html/rfc6455#section-7.4.1)
- `reason` is the optional reason that the socket is being closed. [https://tools.ietf.org/html/rfc6455#section-7.1.6](https://tools.ietf.org/html/rfc6455#section-7.1.6)

#### `ws.send(data)`
- Transmits data to the server over the WebSocket connection.
- Accepts @param data a text string, ArrayBuffer or Blob

---

*Based on*
- https://github.com/joewalnes/reconnecting-websocket
- https://github.com/appuri/robust-websocket
