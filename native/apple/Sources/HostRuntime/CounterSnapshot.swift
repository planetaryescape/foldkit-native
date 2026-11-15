import Foundation

public struct CounterSnapshot: Codable, Equatable {
    public let count: Int64
    public let pending: Int64

    private struct Key: CodingKey {
        let stringValue: String
        let intValue: Int? = nil

        init?(stringValue: String) {
            self.stringValue = stringValue
        }

        init?(intValue: Int) {
            return nil
        }
    }

    private enum CodingKeys: String, CodingKey {
        case count
        case pending
    }

    public init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: Key.self)
        guard Set(fields.allKeys.map(\.stringValue)) == ["count", "pending"] else {
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Expected exactly count and pending"
            ))
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        count = try container.decode(Int64.self, forKey: .count)
        pending = try container.decode(Int64.self, forKey: .pending)
        guard count >= 0, count <= 9_007_199_254_740_991,
              pending >= 0, pending <= 9_007_199_254_740_991 else {
            throw DecodingError.dataCorruptedError(
                forKey: .count, in: container, debugDescription: "Count and pending must be nonnegative safe integers"
            )
        }
    }
}
