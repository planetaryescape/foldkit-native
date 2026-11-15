import Foundation
import JavaScriptCore

enum UTF8Prelude {
    private struct Response: Encodable {
        var bytes: [UInt8]?
        var text: String?
        var error: String?

        var json: String {
            guard let data = try? JSONEncoder().encode(self),
                  let json = String(data: data, encoding: .utf8) else {
                return "{\"error\":\"UTF-8 bridge serialization failed\"}"
            }
            return json
        }
    }

    static func install(in context: JSContext) {
        let encode: @convention(block) (String) -> String = { text in
            Response(bytes: Array(text.utf8)).json
        }
        let decode: @convention(block) (String, Bool) -> String = { json, fatal in
            guard let data = json.data(using: .utf8),
                  let bytes = try? JSONDecoder().decode([UInt8].self, from: data) else {
                return Response(error: "Expected a JSON array of bytes").json
            }
            if fatal, String(data: Data(bytes), encoding: .utf8) == nil {
                return Response(error: "Malformed UTF-8 input").json
            }
            return Response(text: String(decoding: bytes, as: UTF8.self)).json
        }
        context.setObject(encode, forKeyedSubscript: "__foldkitEncodeUTF8" as NSString)
        context.setObject(decode, forKeyedSubscript: "__foldkitDecodeUTF8" as NSString)
        context.evaluateScript(source)
    }

    private static let source = #"""
    (function () {
      function text(value) {
        if (typeof value === 'symbol') throw new TypeError('Cannot encode a Symbol');
        return String(value);
      }
      function response(json) {
        var result = JSON.parse(json);
        if (result.error !== undefined) throw new TypeError(result.error);
        return result;
      }
      class TextEncoder {
        get encoding() { return 'utf-8'; }
        encode(input = '') {
          var normalized = Array.from(text(input), function (character) {
            var unit = character.charCodeAt(0);
            return character.length === 1 && unit >= 0xd800 && unit <= 0xdfff
              ? '\ufffd' : character;
          }).join('');
          return new Uint8Array(response(__foldkitEncodeUTF8(normalized)).bytes);
        }
      }
      class TextDecoder {
        constructor(label = 'utf-8', options = {}) {
          var name = text(label).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '').toLowerCase();
          if (!['utf-8', 'utf8', 'unicode-1-1-utf-8', 'unicode11utf8',
                'unicode20utf8', 'x-unicode20utf8'].includes(name)) {
            throw new RangeError('Only UTF-8 decoding is supported');
          }
          options = options == null ? {} : options;
          Object.defineProperties(this, {
            _fatal: { value: Boolean(options.fatal) },
            _ignoreBOM: { value: Boolean(options.ignoreBOM) }
          });
        }
        get encoding() { return 'utf-8'; }
        get fatal() { return this._fatal; }
        get ignoreBOM() { return this._ignoreBOM; }
        decode(input = undefined, options = {}) {
          if (options != null && options.stream) {
            throw new TypeError('Streaming UTF-8 decoding is not supported');
          }
          var bytes;
          if (input === undefined) {
            bytes = new Uint8Array(0);
          } else if (ArrayBuffer.isView(input)) {
            bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
          } else if (input instanceof ArrayBuffer) {
            bytes = new Uint8Array(input);
          } else {
            throw new TypeError('Expected an ArrayBuffer or ArrayBuffer view');
          }
          var decoded = response(__foldkitDecodeUTF8(JSON.stringify(Array.from(bytes)), this.fatal)).text;
          if (!this.ignoreBOM && decoded.charCodeAt(0) === 0xfeff) {
            decoded = decoded.slice(1);
          }
          return decoded;
        }
      }
      globalThis.TextEncoder = TextEncoder;
      globalThis.TextDecoder = TextDecoder;
    })();
    """#
}
