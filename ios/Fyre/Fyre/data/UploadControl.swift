import Foundation
import Observation
import SwiftUI

/// Cancellation is accepted only before the server mutation starts.
@MainActor @Observable
final class UploadControl {
    private(set) var completedBytes = 0
    private(set) var totalBytes = 0
    private(set) var isCommitting = false
    private(set) var isCancelled = false
    var fraction: Double { totalBytes > 0 ? Double(completedBytes) / Double(totalBytes) : 0 }

    func cancel() { if !isCommitting { isCancelled = true } }
    func checkCancellation() throws { if isCancelled { throw CancellationError() } }
    func progress(completed: Int, total: Int) throws {
        try checkCancellation()
        completedBytes = completed
        totalBytes = total
    }
    func beginCommit() throws {
        try checkCancellation()
        isCommitting = true
    }
}

struct UploadProgressView: View {
    let control: UploadControl
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if control.isCommitting { ProgressView(L10n.tr("upload.saving")) }
            else {
                ProgressView(value: control.fraction) { Text(L10n.tr("upload.progress")) }
                Button(L10n.tr("common.cancel"), role: .cancel) { control.cancel() }
                    .disabled(control.isCancelled)
            }
        }
        .accessibilityElement(children: .contain)
    }
}
