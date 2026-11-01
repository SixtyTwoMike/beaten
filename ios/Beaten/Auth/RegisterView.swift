import SwiftUI

// Making an account in the app (POST /api/v1/auth/register), with the same
// rules as the web's sign-up. The answer is always "check your email"; the
// account can sign in once the address is confirmed.
struct RegisterView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var sentTo: String?

    private struct Payload: Encodable { let name, username, email, password: String }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let sentTo {
                    VStack(spacing: 16) {
                        Image(systemName: "envelope.badge").font(.system(size: 44)).foregroundStyle(Color.mint)
                        Text("Check your email").font(.title2.bold())
                        Text("We've sent a link to \(sentTo). Tap it to confirm your address, then sign in here.")
                            .font(.subheadline)
                            .foregroundStyle(Color.fog)
                            .multilineTextAlignment(.center)
                        Button("Back to sign in") { dismiss() }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(Color.canvas)
                            .padding(.top, 8)
                    }
                    .padding(.top, 60)
                    .padding(.horizontal, 24)
                } else {
                    VStack(spacing: 12) {
                        TextField("Display name", text: $name)
                            .accessibilityIdentifier("register-name")
                            .textContentType(.name)
                            .fieldStyle()
                        TextField("Username", text: $username)
                            .accessibilityIdentifier("register-username")
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .fieldStyle()
                        Text("Your profile will be beaten.games/\(username.isEmpty ? "username" : username.lowercased())")
                            .font(.caption)
                            .foregroundStyle(Color.fog)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        TextField("Email", text: $email)
                            .accessibilityIdentifier("register-email")
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .fieldStyle()
                        SecureField("Password", text: $password)
                            .accessibilityIdentifier("register-password")
                            .textContentType(.newPassword)
                            .fieldStyle()
                        Text("At least 10 characters.").font(.caption).foregroundStyle(Color.fog).frame(maxWidth: .infinity, alignment: .leading)
                        if let error { ErrorBanner(message: error) }
                        Button(action: register) {
                            Group {
                                if busy { ProgressView().tint(.canvas) } else { Text("Create account").fontWeight(.semibold) }
                            }
                            .frame(maxWidth: .infinity, minHeight: 30)
                        }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(Color.canvas)
                        .disabled(busy || name.isEmpty || username.isEmpty || email.isEmpty || password.isEmpty)
                        Text(SignInView.agreement)
                            .font(.caption2)
                            .foregroundStyle(Color.fog)
                            .multilineTextAlignment(.center)
                            .tint(.mint)
                            .padding(.top, 4)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .frame(maxWidth: 440)
                    .frame(maxWidth: .infinity)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.canvas.ignoresSafeArea())
            .navigationTitle(sentTo == nil ? "Create an account" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
        }
    }

    private func register() {
        busy = true
        error = nil
        let address = email.trimmingCharacters(in: .whitespaces)
        Task {
            defer { busy = false }
            do {
                try await model.api.send("POST", "/auth/register", body: Payload(name: name, username: username, email: address, password: password))
                sentTo = address
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
