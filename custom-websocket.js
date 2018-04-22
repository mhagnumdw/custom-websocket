// MIT License:
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// TODO: Does not reconnect according to error code received on onclose? Use shouldReconnect for this.

// TODO: optimization: if sent or received a message, the time for the next PING should be restarted. This avoids sending unnecessary PINGs.

// Based on:
// https://github.com/joewalnes/reconnecting-websocket
// https://github.com/appuri/robust-websocket

/**
 * This behaves like a WebSocket in every way, except if it fails to connect,
 * or it gets disconnected, it will repeatedly poll until it successfully connects
 * again.
 *
 * It is API compatible, so when you have:
 *   ws = new WebSocket('ws://....');
 * you can replace with:
 *   ws = new CustomWebSocket('ws://....');
 *
 * The event stream will typically look like:
 *  onconnecting
 *  onopen
 *  onmessage
 *  onmessage
 *  onclose // lost connection
 *  onconnecting
 *  onopen  // sometime later...
 *  onmessage
 *  onmessage
 *  etc...
 *
 * It is API compatible with the standard WebSocket API, apart from the following members:
 *
 * - `bufferedAmount`
 * - `extensions`
 * - `binaryType`
 *
 * Syntax
 * ======
 * var socket = new CustomWebSocket(url, protocols, options);
 *
 * Parameters
 * ==========
 * url - The url you are connecting to.
 * protocols - Optional string or array of protocols.
 * options - See below
 *
 * Options
 * =======
 * Options can either be passed upon instantiation or set after instantiation:
 *
 * var socket = new CustomWebSocket(url, null, { debug: true });
 * var socket = new CustomWebSocket(url, null, { debug: true, heartbeatInterval: 120000 });
 *
 * or
 *
 * var socket = new CustomWebSocket(url);
 * socket.debug = true;
 * socket.heartbeatInterval = 120000;
 *
 * debug
 * - Whether this instance should log debug messages. Accepts true or false. Default: false.
 *
 * automaticOpen
 * - Whether or not the websocket should attempt to connect immediately upon instantiation. The socket can be manually opened or closed at any time using ws.open() and ws.close().
 *
 * heartbeat
 * - If true send a ping to the server. Accepts true or false. Default: true.
 *
 * heartbeatInterval
 * - Ping interval in milliseconds. Accepts integer. Default: 60000.
 *
 * shouldReconnect
 * - A function that, given a CloseEvent, will return the number of milliseconds to wait to reconnect. Or simply the number of milliseconds. If null to not reconnect. Accepts function, integer or null. Default: exponential function.
 *
 */
(function (global, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module !== 'undefined' && module.exports){
        module.exports = factory();
    } else {
        global.CustomWebSocket = factory();
    }
})(this, function () {

    if (!('WebSocket' in window)) {
        return;
    }

    function CustomWebSocket(url, protocols, options) {

        // Default settings
        var settings = {

            /** Whether this instance should log debug messages. */
            debug: false,

            /** Whether or not the websocket should attempt to connect immediately upon instantiation. */
            automaticOpen: true,

            /** If true send a ping to the server. */
            heartbeat: true,

            /** Ping interval in milliseconds. */
            heartbeatInterval: 60000,

            /** The binary type, possible values 'blob' or 'arraybuffer', default 'blob'. */
            binaryType: 'blob',

            /** A function or number of milliseconds to wait to reconnect. Set to null to not reconnect. */
            shouldReconnect: function(event, attempts) {
                if (attempts > 10) attempts = 10;
                return Math.pow(1.5, attempts) * 500;
            }
        }

        if (!options) { options = {}; }

        // Overwrite and define settings with options if they exist.
        for (var key in settings) {
            if (typeof options[key] !== 'undefined') {
                this[key] = options[key];
            } else {
                this[key] = settings[key];
            }
        }

        // These should be treated as read-only properties

        /** The URL as resolved by the constructor. This is always an absolute URL. Read only. */
        this.url = url;

        /**
         * The current state of the connection.
         * Can be one of: WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED
         * Read only.
         */
        this.readyState = WebSocket.CONNECTING;

        /**
         * A string indicating the name of the sub-protocol the server selected; this will be one of
         * the strings specified in the protocols parameter when creating the WebSocket object.
         * Read only.
         */
        this.protocol = null;

        var self = this;
        var ws;
        var explicitlyClosed = false;
        var attempts = 0;
        var eventTarget = document.createElement('div');

        // Wire up "on*" properties as event handlers

        eventTarget.addEventListener('open',       function(event) { self.onopen(event); });
        eventTarget.addEventListener('close',      function(event) { self.onclose(event); });
        eventTarget.addEventListener('connecting', function(event) { self.onconnecting(event); });
        eventTarget.addEventListener('message',    function(event) { self.onmessage(event); });
        eventTarget.addEventListener('error',      function(event) { self.onerror(event); });

        // Expose the API required by EventTarget

        this.addEventListener = eventTarget.addEventListener.bind(eventTarget);
        this.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
        this.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);

        function generateEvent(s, args) {
            return Object.assign(new CustomEvent(s), args || []);
        };

        function log(...msg) {
            if (self.debug || CustomWebSocket.debugAll) {
                console.debug(...msg);
            }
        }

        this.open = function () {
            ws = new WebSocket(self.url, protocols || []);
            ws.binaryType = this.binaryType;
            eventTarget.dispatchEvent(generateEvent('connecting'));
            log('CustomWebSocket', 'attempt-connect', self.url);
            var timeoutHeartbeat = null;

            ws.onopen = function(event) {
                log('CustomWebSocket', 'onopen', self.url);
                self.protocol = ws.protocol;
                self.readyState = WebSocket.OPEN;
                self.attempts = 0;
                var e = generateEvent('open');
                eventTarget.dispatchEvent(e);
                if (self.heartbeat) {
                    timeoutHeartbeat = setInterval(function() {
                        if (ws.readyState == WebSocket.OPEN) {
                            ws.send('PING');
                            log('CustomWebSocket', 'send-PING', self.url);
                        } else {
                            clearInterval(timeoutHeartbeat);
                        }
                    }, self.heartbeatInterval);
                }
            };

            ws.onclose = function(event) {
                log('CustomWebSocket', 'onclose', self.url);
                clearInterval(timeoutHeartbeat);
                ws = null;
                if (explicitlyClosed) {
                    log('CustomWebSocket', 'explicitly-closed', self.url, 'Closed explicitly. Will not try to reconnect.');
                    self.readyState = WebSocket.CLOSED;
                    eventTarget.dispatchEvent(generateEvent('close'));
                } else {
                    var delay = null;
                    if (typeof self.shouldReconnect === 'function') {
                        delay = self.shouldReconnect(event, self.attempts);
                    }
                    if (typeof self.shouldReconnect === 'number') {
                        delay = self.shouldReconnect;
                    }
                    if (delay) {
                        setTimeout(function() {
                            log('CustomWebSocket', 'reconnecting', self.url);
                            self.attempts++;
                            self.open();
                        }, delay);
                    }
                }
            };

            ws.onmessage = function(event) {
                log('CustomWebSocket', 'onmessage', self.url, event.data);
                var e = generateEvent('message');
                e.data = event.data;
                eventTarget.dispatchEvent(e);
            };

            ws.onerror = function(event) {
                log('CustomWebSocket', 'onerror', self.url, event);
                eventTarget.dispatchEvent(generateEvent('error'));
            };
        }

        // Whether or not to create a websocket upon instantiation
        if (this.automaticOpen == true) {
            this.open();
        }

        /**
         * Transmits data to the server over the WebSocket connection.
         *
         * @param data a text string, ArrayBuffer or Blob to send to the server.
         */
        this.send = function(data) {
            if (ws) {
                log('CustomWebSocket', 'send', self.url, data);
                return ws.send(data);
            } else {
                throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
            }
        };

        /**
         * Closes the WebSocket connection or connection attempt, if any.
         * If the connection is already CLOSED, this method does nothing.
         */
        this.close = function(code, reason) {
            // Default CLOSE_NORMAL code
            if (typeof code == 'undefined') {
                code = 1000;
            }
            explicitlyClosed = true;
            if (ws) {
                ws.close(code, reason);
            }
        };

    }

    /**
     * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
     * this indicates that the connection is ready to send and receive data.
     */
    CustomWebSocket.prototype.onopen = function(event) {};
    /** An event listener to be called when the WebSocket connection's readyState changes to CLOSED. */
    CustomWebSocket.prototype.onclose = function(event) {};
    /** An event listener to be called when a connection begins being attempted. */
    CustomWebSocket.prototype.onconnecting = function(event) {};
    /** An event listener to be called when a message is received from the server. */
    CustomWebSocket.prototype.onmessage = function(event) {};
    /** An event listener to be called when an error occurs. */
    CustomWebSocket.prototype.onerror = function(event) {};

    /**
     * Whether all instances of CustomWebSocket should log debug messages.
     * Setting this to true is the equivalent of setting all instances of CustomWebSocket.debug to true.
     */
    CustomWebSocket.debugAll = false;

    return CustomWebSocket;
});
