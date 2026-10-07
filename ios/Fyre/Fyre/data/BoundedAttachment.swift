import Foundation
import CoreTransferable
import UniformTypeIdentifiers
import ImageIO
import UIKit

enum AttachmentReadError: LocalizedError {
    case empty
    case tooLarge
    case unreadable

    var errorDescription: String? {
        switch self {
        case .empty: return L10n.tr("attachment.error.empty")
        case .tooLarge: return L10n.tr("attachment.error.tooLarge")
        case .unreadable: return L10n.tr("attachment.error.unreadable")
        }
    }
}

enum BoundedAttachment {
    nonisolated static let chatLimit = 20 * 1024 * 1024
    nonisolated static let avatarLimit = 10 * 1024 * 1024

    nonisolated static func validate(_ data: Data, limit: Int = chatLimit) throws {
        guard !data.isEmpty else { throw AttachmentReadError.empty }
        guard data.count <= limit else { throw AttachmentReadError.tooLarge }
    }

    /// Read at most limit + 1 bytes, even if metadata is absent or the file grows.
    nonisolated static func read(_ url: URL, limit: Int = chatLimit) throws -> Data {
        do {
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            guard values.isRegularFile == true else { throw AttachmentReadError.unreadable }
            if let size = values.fileSize, size > limit { throw AttachmentReadError.tooLarge }
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            var data = Data()
            while data.count <= limit {
                try Task.checkCancellation()
                let chunk = try handle.read(upToCount: min(64 * 1024, limit + 1 - data.count)) ?? Data()
                if chunk.isEmpty { break }
                data.append(chunk)
            }
            try validate(data, limit: limit)
            return data
        } catch let error as AttachmentReadError {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw AttachmentReadError.unreadable
        }
    }

    static func profilePhotoData(from data: Data) throws -> Data {
        try validate(data)
        guard let image = previewImage(from: data), let jpeg = image.jpegData(compressionQuality: 0.96) else {
            throw AttachmentReadError.unreadable
        }
        try validate(jpeg, limit: avatarLimit)
        return jpeg
    }

    /// Decode a bounded thumbnail instead of expanding the full source image.
    static func previewImage(from data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}

/// PhotosPicker provides a temporary file; consume it within the import closure.
struct BoundedPickedAttachment: Transferable, Sendable {
    let data: Data
    let fileName: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .data) { received in
            BoundedPickedAttachment(
                data: try BoundedAttachment.read(received.file),
                fileName: received.file.lastPathComponent
            )
        }
    }
}
