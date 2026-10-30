import SwiftUI

// Fun things to make from your gaming history (the web's /extras).
struct ExtrasView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                ForEach(Extra.allCases) { extra in
                    NavigationLink { extra.destination } label: { ExtraCard(extra: extra) }
                        .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .canvasBackground()
        .navigationTitle("Extras")
    }
}

enum Extra: String, CaseIterable, Identifiable {
    case chronicles

    var id: String { rawValue }

    var title: String {
        switch self {
        case .chronicles: "Console chronicles"
        }
    }

    var blurb: String {
        switch self {
        case .chronicles: "Map every console you've owned: when you got it, how old you were, and the three games that defined it."
        }
    }

    var symbol: String {
        switch self {
        case .chronicles: "point.bottomleft.forward.to.point.topright.scurvepath"
        }
    }

    @ViewBuilder var destination: some View {
        switch self {
        case .chronicles: ChronicleScreen()
        }
    }
}

struct ExtraCard: View {
    let extra: Extra

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: extra.symbol)
                .font(.title2)
                .foregroundStyle(Color.mint)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(extra.title).font(.headline)
                Text(extra.blurb).font(.subheadline).foregroundStyle(Color.fog)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Color.fog)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.edge))
    }
}
