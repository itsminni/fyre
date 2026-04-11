//
//  ChatBackgroundAssetStore.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/04/26.
//

import Foundation
import UIKit

enum ChatBackgroundAssetStore {
    static let appStorageKey = "settings_chat_background_custom_image_name"

    static func currentImage() -> UIImage? {
        guard let url = currentFileURL() else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    @discardableResult
    static func saveImageData(_ data: Data) throws -> String {
        let image = try normalizedImage(from: data)
        return try saveImage(image)
    }

    @discardableResult
    static func saveImage(_ image: UIImage) throws -> String {
        guard let normalizedData = image.jpegData(compressionQuality: 0.94) else {
            throw ChatBackgroundAssetStoreError.encodingFailed
        }

        let directory = try backgroundDirectory()
        let fileName = "custom-chat-background.jpg"
        let fileURL = directory.appendingPathComponent(fileName)
        try normalizedData.write(to: fileURL, options: .atomic)
        return fileName
    }

    static func normalizedImage(from data: Data) throws -> UIImage {
        guard let image = UIImage(data: data) else {
            throw ChatBackgroundAssetStoreError.invalidImage
        }
        return normalizedImage(image)
    }

    static func normalizedImage(_ image: UIImage) -> UIImage {
        let format = image.imageRendererFormat
        format.scale = max(image.scale, UIScreen.main.scale)
        return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }

    static func deleteCurrentImage(named fileName: String?) {
        guard let fileName, !fileName.isEmpty else { return }
        let fileURL = backgroundDirectoryURL.appendingPathComponent(fileName)
        try? FileManager.default.removeItem(at: fileURL)
    }

    static func currentFileURL() -> URL? {
        let fileName = UserDefaults.standard.string(forKey: appStorageKey)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !fileName.isEmpty else { return nil }
        let url = backgroundDirectoryURL.appendingPathComponent(fileName)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    private static func backgroundDirectory() throws -> URL {
        let directory = backgroundDirectoryURL
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private static var backgroundDirectoryURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ChatBackgrounds", isDirectory: true)
    }
}

enum ChatBackgroundAssetStoreError: LocalizedError {
    case invalidImage
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .invalidImage:
            return "Invalid image data."
        case .encodingFailed:
            return "Unable to encode background image."
        }
    }
}
