import UIKit

// Mirrors src/lib/year-review-video.ts (same timings and layout).
nonisolated struct YearReview: Codable, Hashable, Sendable {
    nonisolated struct Entry: Codable, Hashable, Sendable {
        let igdbId: Int
        let name: String
        let coverUrl: URL?
        let status: PlayStatus
        let rating: Int?
        let finishedAt: PartialDate
        let platformId: Int?
    }

    nonisolated struct BestMonth: Codable, Hashable, Sendable {
        let month: Int // 1–12
        let count: Int
    }

    static let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    // "4 January" or "January", as dayMonth() in src/lib/format.ts.
    static func dayMonth(_ date: PartialDate) -> String {
        let month = date.month.map { months[$0 - 1] } ?? ""
        return date.day.map { "\($0) \(month)" } ?? month
    }

    let year: Int
    let name: String
    let username: String?
    let finished: Int
    let beaten: Int
    let mastered: Int
    let replays: Int
    let topPlatformId: Int?
    let firstGame: Entry?
    let bestMonth: BestMonth?
    let games: [Entry]
    let top: [Entry]
    let years: [Int]
}

nonisolated struct YearReviewPlan: VideoPlan {
    let review: YearReview
    let images: VideoImages

    private static let accent = UIColor(hex: 0x00D474)
    private static let gold = UIColor(hex: 0xFFB43A)
    private static let intro = 1.6
    private static let stats = 3.0
    private static let highlights = 3.2
    private static let wallStep = 0.28
    private static let wallHold = 1.2
    private static let fave = 1.8
    private static let outro = 2.4
    private static let wallMax = 12
    private static let cols = 4
    private static let cw: CGFloat = 225
    private static let ch: CGFloat = 300
    private static let gap: CGFloat = 20

    private let wallGames: [YearReview.Entry]
    private let tHighlights: Double
    private let tWall: Double
    private let tFaves: Double
    private let tOutro: Double
    let duration: Double

    init(review: YearReview, images: VideoImages) {
        self.review = review
        self.images = images
        wallGames = Array(review.games.suffix(Self.wallMax).reversed())
        let wall = review.finished > 0 ? Double(wallGames.count) * Self.wallStep + Self.wallHold : 0
        let hasHighlights = review.finished > 0 && (review.firstGame != nil || review.bestMonth != nil)
        tHighlights = Self.intro + Self.stats
        tWall = tHighlights + (hasHighlights ? Self.highlights : 0)
        tFaves = tWall + wall
        tOutro = tFaves + Double(review.top.count) * Self.fave
        duration = tOutro + Self.outro
    }

    static func imageURLs(_ review: YearReview) -> Set<URL> {
        Set(review.games.compactMap { VideoImages.bigCover($0.coverUrl) })
    }

    private var cx: CGFloat { Video.width / 2 }

    func draw(_ ctx: CGContext, at time: Double) {
        let d = Draw(ctx: ctx)
        background(d)
        if time < Self.intro { intro(d, time) }
        else if time < tHighlights { stats(d, time - Self.intro) }
        else if time < tWall { highlights(d, time - tHighlights) }
        else if time < tFaves { wall(d, time - tWall) }
        else if time < tOutro {
            let k = min(review.top.count - 1, Int(floor((time - tFaves) / Self.fave)))
            fave(d, k, (time - tFaves - Double(k) * Self.fave) / Self.fave)
        } else { outro(d, time - tOutro) }
        footer(d)
    }

    private func background(_ d: Draw) {
        d.fill(CGRect(x: 0, y: 0, width: Video.width, height: Video.height), Video.canvas)
        d.radialGlow(center: CGPoint(x: 100, y: 200), radius: 900, color: Self.accent, alpha: 0x40 / 255)
        d.radialGlow(center: CGPoint(x: 1000, y: 1200), radius: 900, color: Self.accent, alpha: 0x2A / 255)
        d.radialGlow(center: CGPoint(x: 200, y: 1900), radius: 800, color: Self.accent, alpha: 0x22 / 255)
    }

    private func footer(_ d: Draw) {
        d.text("BEATEN", x: Video.margin, y: Video.height - 80, font: Fonts.system(34, .bold), color: .white, kern: 10)
        if let username = review.username {
            d.text("beaten.games/\(username)", x: Video.width - Video.margin, y: Video.height - 80, font: Fonts.system(30), color: Video.fog, align: .right)
        }
    }

    private func intro(_ d: Draw, _ t: Double) {
        let a = CGFloat(ease(clamp01(t / 0.4)))
        d.ctx.saveGState()
        d.ctx.setAlpha(a)
        d.text("MY", x: cx, y: 700, font: Fonts.system(64, .bold), color: .white, align: .center, kern: 12)
        d.text("IN GAMES", x: cx, y: 1150, font: Fonts.system(64, .bold), color: .white, align: .center, kern: 12)
        let pop = CGFloat(easeOutBack(clamp01((t - 0.2) / 0.6)))
        d.ctx.saveGState()
        d.ctx.translateBy(x: cx, y: 960)
        d.ctx.scaleBy(x: max(pop, 0.001), y: max(pop, 0.001))
        d.text(String(review.year), x: 0, y: 100, font: Fonts.system(300, .heavy), color: Self.accent, align: .center)
        d.ctx.restoreGState()
        d.text(review.name, x: cx, y: 1260, font: Fonts.system(40), color: Video.fog, align: .center)
        d.ctx.restoreGState()
    }

    private func stats(_ d: Draw, _ t: Double) {
        guard review.finished > 0 else {
            d.text("Nothing finished yet", x: cx, y: 900, font: Fonts.system(64, .bold), color: .white, align: .center)
            d.text("\(review.year)'s story is still being written.", x: cx, y: 980, font: Fonts.system(40), color: Video.fog, align: .center)
            return
        }
        let count = Int((Double(review.finished) * ease(clamp01(t / 1.2))).rounded())
        d.text(String(count), x: cx, y: 900, font: Fonts.system(340, .heavy), color: Self.accent, align: .center)
        d.text(review.finished == 1 ? "game finished" : "games finished", x: cx, y: 1000, font: Fonts.system(64, .bold), color: .white, align: .center)

        var pills: [(String, UIColor)] = []
        if review.beaten > 0 { pills.append(("\(review.beaten) beaten", Self.accent)) }
        if review.mastered > 0 { pills.append(("\(review.mastered) mastered", Self.gold)) }
        let font = Fonts.system(44, .bold)
        let widths = pills.map { d.width($0.0, font) + 70 }
        var x = cx - (widths.reduce(0, +) + CGFloat(max(0, pills.count - 1)) * 24) / 2
        d.ctx.saveGState()
        d.ctx.setAlpha(CGFloat(ease(clamp01((t - 1.4) / 0.4))))
        for (k, pill) in pills.enumerated() {
            d.fillRounded(CGRect(x: x, y: 1090, width: widths[k], height: 84), 42, pill.1)
            d.text(pill.0, x: x + 35, y: 1148, font: font, color: Video.canvas)
            x += widths[k] + 24
        }
        d.ctx.restoreGState()
        if review.replays > 0 {
            d.ctx.saveGState()
            d.ctx.setAlpha(CGFloat(ease(clamp01((t - 2.0) / 0.4))))
            d.text("including \(review.replays) replay\(review.replays == 1 ? "" : "s")", x: cx, y: 1250, font: Fonts.system(38), color: Video.fog, align: .center)
            d.ctx.restoreGState()
        }
    }

    private func highlights(_ d: Draw, _ t: Double) {
        let ctx = d.ctx
        let label = { (text: String, y: CGFloat) in
            d.text(text, x: cx, y: y, font: Fonts.system(36, .bold), color: Video.fog, align: .center, kern: 8)
        }
        if let first = review.firstGame {
            ctx.saveGState()
            ctx.setAlpha(CGFloat(ease(clamp01(t / 0.4))))
            ctx.beginTransparencyLayer(auxiliaryInfo: nil)
            label("FIRST GAME FINISHED", 360)
            let pop = CGFloat(easeOutBack(clamp01(t / 0.5)))
            ctx.saveGState()
            ctx.translateBy(x: cx, y: 610)
            ctx.scaleBy(x: max(pop, 0.001), y: max(pop, 0.001))
            let rect = CGRect(x: -150, y: -200, width: 300, height: 400)
            ctx.saveGState()
            d.shadow(UIColor(white: 0, alpha: 0.5), blur: 40, y: 16)
            d.fillRounded(rect, 20, Video.canvas)
            ctx.restoreGState()
            cover(d, first.coverUrl, rect, 20)
            ctx.restoreGState()
            d.text(first.name, x: cx, y: 890, font: Fonts.system(56, .bold), color: .white, align: .center, maxWidth: Video.width - 2 * Video.margin)
            d.text(YearReview.dayMonth(first.finishedAt), x: cx, y: 950, font: Fonts.system(38), color: Video.fog, align: .center)
            ctx.endTransparencyLayer()
            ctx.restoreGState()
        }
        if let best = review.bestMonth {
            let b = CGFloat(ease(clamp01((t - (review.firstGame == nil ? 0 : 1.0)) / 0.4)))
            ctx.saveGState()
            ctx.setAlpha(b)
            ctx.translateBy(x: 0, y: (1 - b) * 40)
            label("MOST PRODUCTIVE MONTH", 1130)
            d.text(YearReview.months[best.month - 1], x: cx, y: 1290, font: Fonts.system(120, .heavy), color: Self.accent, align: .center)
            d.text(best.count == 1 ? "1 game finished" : "\(best.count) games finished", x: cx, y: 1370, font: Fonts.system(44, .semibold), color: .white, align: .center)
            ctx.restoreGState()
        }
    }

    private func cover(_ d: Draw, _ url: URL?, _ rect: CGRect, _ radius: CGFloat) {
        d.ctx.saveGState()
        d.ctx.addPath(d.roundedRect(rect, radius))
        d.ctx.clip()
        ChronicleVideo.cover(d, images, url, rect)
        d.ctx.restoreGState()
    }

    private func wall(_ d: Draw, _ t: Double) {
        let ctx = d.ctx
        d.text("EVERYTHING I FINISHED", x: cx, y: 380, font: Fonts.system(44, .bold), color: .white, align: .center, kern: 8)
        let rows = (wallGames.count + Self.cols - 1) / Self.cols
        let top = 470 + CGFloat(3 - rows) * (Self.ch + Self.gap) / 2
        for (k, game) in wallGames.enumerated() {
            let land = CGFloat(easeOutBack(clamp01((t - Double(k) * Self.wallStep) / 0.35)))
            guard land > 0 else { continue }
            let col = k % Self.cols
            let row = k / Self.cols
            let inRow = CGFloat(min(Self.cols, wallGames.count - row * Self.cols))
            let left = cx - (inRow * Self.cw + (inRow - 1) * Self.gap) / 2
            let x = left + CGFloat(col) * (Self.cw + Self.gap)
            let y = top + CGFloat(row) * (Self.ch + Self.gap)
            let s = 1.6 - 0.6 * land
            ctx.saveGState()
            ctx.setAlpha(min(1, land * 2))
            ctx.translateBy(x: x + Self.cw / 2, y: y + Self.ch / 2)
            ctx.scaleBy(x: s, y: s)
            let rect = CGRect(x: -Self.cw / 2, y: -Self.ch / 2, width: Self.cw, height: Self.ch)
            ctx.saveGState()
            d.shadow(UIColor(white: 0, alpha: 0.5), blur: 24, y: 10)
            d.fillRounded(rect, 14, Video.canvas)
            ctx.restoreGState()
            cover(d, game.coverUrl, rect, 14)
            ctx.restoreGState()
        }
        let more = review.finished - wallGames.count
        let landed = Double(wallGames.count) * Self.wallStep
        if more > 0 && t > landed {
            ctx.saveGState()
            ctx.setAlpha(CGFloat(ease(clamp01((t - landed) / 0.3))))
            d.text("+ \(more) more", x: cx, y: top + 3 * (Self.ch + Self.gap) + 70, font: Fonts.system(44, .semibold), color: Video.fog, align: .center)
            ctx.restoreGState()
        }
    }

    private func star(_ d: Draw, center: CGPoint, radius r: CGFloat, fill: Double) {
        let path = CGMutablePath()
        for i in 0..<10 {
            let rad = i % 2 == 0 ? r : r * 0.45
            let a = -Double.pi / 2 + Double(i) * Double.pi / 5
            let p = CGPoint(x: center.x + rad * cos(a), y: center.y + rad * sin(a))
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        d.ctx.saveGState()
        d.ctx.addPath(path)
        d.ctx.setFillColor(UIColor(white: 1, alpha: 0.15).cgColor)
        d.ctx.fillPath()
        if fill > 0 {
            d.ctx.addPath(path)
            d.ctx.clip()
            d.fill(CGRect(x: center.x - r, y: center.y - r, width: 2 * r * CGFloat(fill), height: 2 * r), Self.accent)
        }
        d.ctx.restoreGState()
    }

    private func fave(_ d: Draw, _ k: Int, _ local: Double) {
        let ctx = d.ctx
        let game = review.top[k]
        let enter = CGFloat(ease(clamp01(local / 0.25)))
        let leave = CGFloat(ease(clamp01((local - 0.85) / 0.15)))
        ctx.saveGState()
        ctx.setAlpha(enter * (1 - leave))
        ctx.translateBy(x: (1 - enter) * 300 - leave * 300, y: 0)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        d.text("MY FAVOURITES", x: cx, y: 340, font: Fonts.system(44, .bold), color: .white, align: .center, kern: 8)
        d.text("#\(k + 1)", x: cx, y: 500, font: Fonts.system(120, .heavy), color: Self.accent, align: .center)
        let rect = CGRect(x: cx - 240, y: 560, width: 480, height: 640)
        ctx.saveGState()
        d.shadow(UIColor(white: 0, alpha: 0.55), blur: 50, y: 20)
        d.fillRounded(rect, 26, Video.canvas)
        ctx.restoreGState()
        cover(d, game.coverUrl, rect, 26)
        d.text(game.name, x: cx, y: 1300, font: Fonts.system(60, .bold), color: .white, align: .center, maxWidth: Video.width - 2 * Video.margin)
        let rating = Double(game.rating ?? 0) / 2
        for i in 0..<5 {
            star(d, center: CGPoint(x: cx - 2 * 74 + CGFloat(i) * 74, y: 1380), radius: 30, fill: clamp01(rating - Double(i)))
        }
        ctx.endTransparencyLayer()
        ctx.restoreGState()
    }

    private func outro(_ d: Draw, _ t: Double) {
        d.ctx.saveGState()
        d.ctx.setAlpha(CGFloat(ease(clamp01(t / 0.6))))
        let mid = Video.height / 2
        d.text(String(review.year), x: cx, y: mid - 60, font: Fonts.system(160, .heavy), color: Self.accent, align: .center)
        d.text(review.finished == 1 ? "1 game finished" : "\(review.finished) games finished", x: cx, y: mid + 40, font: Fonts.system(60, .bold), color: .white, align: .center)
        if let username = review.username {
            d.text("beaten.games/\(username)", x: cx, y: mid + 130, font: Fonts.system(38), color: Video.fog, align: .center)
        }
        d.ctx.restoreGState()
    }
}
