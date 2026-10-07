import Foundation

extension AppwriteService {
    /// Appwrite requires Content-Range and X-Appwrite-ID after the first chunk.
    /// https://appwrite.io/docs/references/cloud/client-rest/storage
    func uploadFile(
        data: Data,
        bucketId: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        permissions: [String],
        limit: Int,
        control: UploadControl? = nil,
        completedBefore: Int = 0,
        totalBytes: Int? = nil
    ) async throws {
        try BoundedAttachment.validate(data, limit: limit)
        try await control?.progress(completed: completedBefore, total: totalBytes ?? data.count)
        let chunkSize = 5 * 1024 * 1024
        var started = false
        do {
            for start in stride(from: 0, to: data.count, by: chunkSize) {
                try Task.checkCancellation()
                try await control?.checkCancellation()
                let end = min(start + chunkSize, data.count)
                let boundary = "Boundary-\(UUID().uuidString)"
                var request = URLRequest(url: url(pathComponents: ["storage", "buckets", bucketId, "files"]))
                request.httpMethod = "POST"
                request.setValue(configuration.projectId, forHTTPHeaderField: "X-Appwrite-Project")
                request.setValue("1.8.0", forHTTPHeaderField: "X-Appwrite-Response-Format")
                request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                if data.count > chunkSize {
                    request.setValue("bytes \(start)-\(end - 1)/\(data.count)", forHTTPHeaderField: "Content-Range")
                }
                if start > 0 { request.setValue(fileId, forHTTPHeaderField: "X-Appwrite-ID") }
                request.httpBody = makeMultipartBody(
                    boundary: boundary, fileId: fileId, fileName: fileName,
                    mimeType: mimeType, fileData: data.subdata(in: start..<end), permissions: permissions
                )
                started = true
                let (responseData, response) = try await session.data(for: request)
                guard let response = response as? HTTPURLResponse else { throw AppwriteServiceError.invalidResponse }
                guard response.statusCode == 201 else {
                    throw makeAPIError(from: responseData, statusCode: response.statusCode)
                }
                guard let file = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
                      file["$id"] as? String == fileId else { throw AppwriteServiceError.invalidResponse }
                try await control?.progress(completed: completedBefore + end, total: totalBytes ?? data.count)
            }
        } catch {
            // No profile/message references this new ID until uploadFile returns.
            // Cleanup also runs outside a cancelled caller's task.
            if started {
                await Task { try? await self.deleteUploadedFile(bucketId: bucketId, fileId: fileId) }.value
            }
            throw error
        }
    }

    func deleteUploadedFile(bucketId: String, fileId: String) async throws {
        _ = try await sendRequest(
            method: "DELETE", pathComponents: ["storage", "buckets", bucketId, "files", fileId],
            expectedStatusCodes: [204, 404]
        )
    }
}

/// Timeouts and server errors do not establish whether the write committed.
/// Deleting an uploaded file in those cases could break a saved profile/message.
nonisolated func isDefinitiveWriteRejection(_ error: Error) -> Bool {
    // An HTTP failure while polling an execution is not its write result.
    guard let error = error as? AppwriteServiceError,
          case let .api(status, _, type) = error, type == "function" else { return false }
    return [400, 401, 403, 404, 413, 422].contains(status)
}
