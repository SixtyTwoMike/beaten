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
    case shareCards
    case yearReview

    var id: String { rawValue }

    var title: String {
        switch self {
        case .chronicles: "Console Chronicles"
        case .shareCards: "Share cards"
        case .yearReview: "Year in review"
        }
    }

    var blurb: String {
        switch self {
        case .chronicles: "Map every console you've owned: when you got it, how old you were, and the three games that defined it."
        case .shareCards: "Your last four beaten or played as an image for Instagram, Messages or anywhere else."
        case .yearReview: "Everything you finished in a year, counted up with your favourites, as a story video."
        }
    }

    var symbol: String {
        switch self {
        case .chronicles: "point.bottomleft.forward.to.point.topright.scurvepath"
        case .shareCards: "rectangle.portrait.on.rectangle.portrait.angled"
        case .yearReview: "calendar.badge.checkmark"
        }
    }

    @ViewBuilder var destination: some View {
        switch self {
        case .chronicles: ChronicleScreen()
        case .shareCards: ShareCardsView()
        case .yearReview: YearReviewScreen()
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
