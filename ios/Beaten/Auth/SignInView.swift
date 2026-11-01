import AuthenticationServices
import CryptoKit
import SwiftUI

struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    // Raw nonce for the Apple request in flight; Apple gets its SHA-256 and
    // the server checks the two match.
    @State private var nonce = ""
    @State private var registering = false

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 10) {
                    Logo(size: 34)
                    Text("Track the games you've beaten and mastered.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fog)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 60)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .fieldStyle()
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .fieldStyle()
                        .onSubmit(signIn)
                    if let error { ErrorBanner(message: error) }
                    Button(action: signIn) {
                        Group {
                            if busy { ProgressView().tint(.canvas) } else { Text("Sign in").fontWeight(.semibold) }
                        }
                        .frame(maxWidth: .infinity, minHeight: 30)
                    }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(Color.canvas)
                    .disabled(busy || email.isEmpty || password.isEmpty)
                }

                HStack {
                    Rectangle().fill(Color.edge).frame(height: 1)
                    Text("or").font(.footnote).foregroundStyle(Color.fog)
                    Rectangle().fill(Color.edge).frame(height: 1)
                }

                SignInWithAppleButton(.continue) { request in
                    nonce = Self.randomNonce()
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = Self.sha256(nonce)
                } onCompletion: { result in
                    appleFinished(result)
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 48)
                .clipShape(Capsule())
                .disabled(busy)

                VStack(spacing: 10) {
                    Button("Create an account") { registering = true }
                    Link("Forgot your password?", destination: APIClient.baseURL.appending(path: "forgot-password"))
                        .foregroundStyle(Color.fog)
                }
                .font(.footnote)

                // Accounts made here (Sign in with Apple) agree to the same terms as on the web.
                Text(Self.agreement)
                    .font(.caption2)
                    .foregroundStyle(Color.fog)
                    .multilineTextAlignment(.center)
                    .tint(.mint)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.canvas)
        .sheet(isPresented: $registering) { RegisterView() }
    }

    private func signIn() {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        run { try await model.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password) }
    }

    private func appleFinished(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let e):
            if (e as? ASAuthorizationError)?.code != .canceled { error = e.localizedDescription }
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8) else {
                error = "Apple didn't return a sign-in token. Try again."
                return
            }
            // Apple only shares the name on the first sign-in.
            let name = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) }
            let raw = nonce
            run { try await model.signInWithApple(identityToken: token, nonce: raw, name: name?.isEmpty == false ? name : nil) }
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch { self.error = error.localizedDescription }
        }
    }

    static func randomNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

extension View {
    // Text field on a dark card, as on the web's forms.
    func fieldStyle() -> some View {
        padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.edge))
    }
}

extension SignInView {
    // Markdown, so the two links are tappable.
    static let agreement: AttributedString = {
        let base = APIClient.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let text = "By continuing you agree to the [Terms of use](\(base)/terms) and [Privacy policy](\(base)/privacy). There's no tolerance for abusive or objectionable content."
        return (try? AttributedString(markdown: text)) ?? AttributedString(text)
    }()
}
