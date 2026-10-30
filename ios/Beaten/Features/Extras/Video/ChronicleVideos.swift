import UIKit

// The chronicle story videos. Each mirrors its web twin:
//   RoadPlan  ↔ plan() in src/lib/chronicle-video.ts
//   YearsPlan ↔ yearsPlan() in src/lib/chronicle-video-styles.ts
//   CRTPlan   ↔ crtPlan() in src/lib/chronicle-video-styles.ts

nonisolated enum ChronicleVideo {
    static func plan(_ style: VideoStyle, chronicle: Chronicle, images: VideoImages) -> VideoPlan {
        switch style {
        case .road: RoadPlan(chronicle: chronicle, images: images)
        case .years: YearsPlan(chronicle: chronicle, images: images)
        case .crt: CRTPlan(chronicle: chronicle, images: images)
        }
    }

    static func imageURLs(_ chronicle: Chronicle) -> Set<URL> {
        var urls = Set<URL>()
        for stop in chronicle.stops {
            if let art = stop.art { urls.insert(art.src) }
            for game in stop.games { if let url = VideoImages.bigCover(game.coverUrl) { urls.insert(url) } }
        }
        return urls
    }

    static let outro = 2.6

    // Seconds per console, inside an Instagram story's 60 s.
    static func beat(_ n: Int, intro: Double, min lo: Double, max hi: Double) -> Double {
        max(lo, min(hi, (56 - intro - outro) / Double(max(1, n))))
    }

    static func link(_ c: Chronicle) -> String? { c.username.map { "beaten.games/\($0)/chronicles" } }

    // Shared parts (drawBackground, drawFooter, drawOutro on the web).

    static func background(_ d: Draw, _ c: Chronicle, cameraY: CGFloat) {
        d.fill(CGRect(x: 0, y: 0, width: Video.width, height: Video.height), Video.canvas)
        let a = c.accent.uiColor()
        switch c.background {
        case .glow:
            d.radialGlow(center: CGPoint(x: 100, y: 200), radius: 900, color: a, alpha: 0x40 / 255)
            d.radialGlow(center: CGPoint(x: 1000, y: 1200), radius: 900, color: a, alpha: 0x2A / 255)
            d.radialGlow(center: CGPoint(x: 200, y: 1900), radius: 800, color: a, alpha: 0x22 / 255)
        case .grid:
            let step: CGFloat = 64
            let off = -(cameraY * 0.5).truncatingRemainder(dividingBy: step)
            let path = CGMutablePath()
            var x: CGFloat = 0
            while x <= Video.width { path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: Video.height)); x += step }
            var y = off
            while y <= Video.height { path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: Video.width, y: y)); y += step }
            d.ctx.addPath(path)
            d.ctx.setStrokeColor(c.accent.uiColor(0x22 / 255).cgColor)
            d.ctx.setLineWidth(2)
            d.ctx.strokePath()
        case .plain:
            break
        }
    }

    static func footer(_ d: Draw, _ c: Chronicle) {
        let top = Video.height - 260
        d.linear(
            CGRect(x: 0, y: top, width: Video.width, height: 260),
            from: Video.canvas.withAlphaComponent(0), to: Video.canvas,
            start: CGPoint(x: 0, y: top), end: CGPoint(x: 0, y: top + 260 * 0.6)
        )
        d.fill(CGRect(x: 0, y: top + 156, width: Video.width, height: 104), Video.canvas)
        d.text("BEATEN", x: Video.margin, y: Video.height - 80, font: Fonts.system(34, .bold), color: .white, kern: 10)
        if let link = link(c) {
            d.text(link, x: Video.width - Video.margin, y: Video.height - 80, font: Fonts.system(30), color: Video.fog, align: .right)
        }
    }

    static func outro(_ d: Draw, _ c: Chronicle, _ t: Double) {
        let e = CGFloat(ease(t))
        d.fill(CGRect(x: 0, y: 0, width: Video.width, height: Video.height), Video.canvas.withAlphaComponent(0.97 * e))
        d.ctx.saveGState()
        d.ctx.setAlpha(e)
        let n = c.stops.count
        d.text(String(n), x: Video.width / 2, y: Video.height / 2 - 60, font: Fonts.system(160, .bold), color: c.accent.uiColor(), align: .center)
        d.text(n == 1 ? "console and counting" : "consoles and counting", x: Video.width / 2, y: Video.height / 2 + 30, font: Fonts.system(56, .bold), color: .white, align: .center)
        if let link = link(c) {
            d.text(link, x: Video.width / 2, y: Video.height / 2 + 120, font: Fonts.system(38), color: Video.fog, align: .center)
        }
        d.ctx.restoreGState()
    }

    static func consoleArt(_ d: Draw, _ stop: ChronicleStop, _ images: VideoImages, _ box: CGRect) {
        if let art = stop.art, let img = images[art.src] {
            if art.kind == .photo {
                d.ctx.saveGState()
                d.shadow(UIColor(white: 0, alpha: 0.55), blur: 40, y: 20)
                d.image(img, in: box, cover: false)
                d.ctx.restoreGState()
            } else {
                let plate = CGRect(x: box.minX + box.width * 0.1, y: box.minY, width: box.width * 0.8, height: box.height)
                d.fillRounded(plate, 28, UIColor(white: 1, alpha: 0.92))
                d.image(img, in: plate.insetBy(dx: 50, dy: 40), cover: false)
            }
        } else {
            d.text(stop.platformName, x: box.midX, y: box.midY, font: Fonts.system(64, .bold), color: .white, align: .center, maxWidth: box.width)
        }
    }

    static func cover(_ d: Draw, _ images: VideoImages, _ url: URL?, _ box: CGRect) {
        if let img = images[VideoImages.bigCover(url)] {
            d.image(img, in: box, cover: true)
        } else {
            d.linear(box, from: UIColor(hex: 0x2B3B55), to: UIColor(hex: 0x141B26), start: box.origin, end: CGPoint(x: box.maxX, y: box.maxY))
        }
    }

    static func badges(_ d: Draw, _ stop: ChronicleStop, accent: UIColor, centreX: CGFloat?, x left: CGFloat, y: CGFloat, size: CGFloat) {
        let font = Fonts.system(size, .bold)
        let labels = stop.badges.map { $0.label.uppercased() }
        let height = size * 1.75
        let widths = labels.map { d.width($0, font) + size * 3.1 }
        var x = centreX.map { $0 - (widths.reduce(0, +) + CGFloat(labels.count - 1) * 12) / 2 } ?? left
        for (k, label) in labels.enumerated() {
            let pill = CGRect(x: x, y: y, width: widths[k], height: height)
            d.fillRounded(pill, height / 2, accent)
            d.star(center: CGPoint(x: x + size * 1.1, y: y + height / 2), radius: size * 0.46, color: Video.canvas)
            d.text(label, x: x + size * 1.9, y: y + height / 2 + size * 0.36, font: font, color: Video.canvas)
            x += widths[k] + 12
        }
    }
}

// MARK: - Road trip

nonisolated struct RoadPlan: VideoPlan {
    let chronicle: Chronicle
    let images: VideoImages

    private struct Card { let stop: ChronicleStop; let x: CGFloat; let y: CGFloat; let h: CGFloat }

    private static let cardW: CGFloat = 780
    private static let pad: CGFloat = 44
    private static let gap: CGFloat = 220
    private static let headerH: CGFloat = 600
    private static let photoH: CGFloat = 330
    private static let coverW: CGFloat = 188
    private static let coverH: CGFloat = 250
    private static let intro = 1.6

    private let cards: [Card]
    private let beat: Double
    let duration: Double

    init(chronicle: Chronicle, images: VideoImages) {
        self.chronicle = chronicle
        self.images = images
        var y = Self.headerH
        var cards: [Card] = []
        for (i, stop) in chronicle.stops.enumerated() {
            var h = Self.pad + 96 + 18 + Self.photoH + 24 + 56
            if stop.model != nil { h += 42 }
            if !stop.badges.isEmpty { h += 52 }
            if stop.note != nil { h += 44 }
            if !stop.games.isEmpty { h += 24 + Self.coverH }
            h += Self.pad
            let x = i % 2 == 1 ? Video.width - Video.margin - Self.cardW : Video.margin
            cards.append(Card(stop: stop, x: x, y: y, h: h))
            y += h + Self.gap
        }
        self.cards = cards
        let n = cards.count
        beat = max(1.1, min(2.2, (56 - Self.intro - ChronicleVideo.outro) / Double(max(1, n))))
        duration = Self.intro + Double(n) * beat + ChronicleVideo.outro
    }

    private func focus(_ i: Int) -> CGFloat {
        i < 0 ? Video.height / 2 : max(Video.height / 2, cards[i].y + cards[i].h / 2 + 60)
    }

    func draw(_ ctx: CGContext, at time: Double) {
        let d = Draw(ctx: ctx)
        let n = cards.count
        let t = time - Self.intro
        let i = min(n - 1, Int(floor(t / beat)))
        let local = t < 0 ? 0 : clamp01((t - Double(i) * beat) / beat)
        let move = CGFloat(ease(clamp01(local / 0.55)))
        let centre = t < 0 || n == 0 ? Video.height / 2 : focus(i - 1) + (focus(i) - focus(i - 1)) * move
        let cameraY = centre - Video.height / 2

        ChronicleVideo.background(d, chronicle, cameraY: cameraY)
        ctx.saveGState()
        ctx.translateBy(x: 0, y: -cameraY)
        header(d, clamp01(time / 0.9))
        for k in cards.indices where k > 0 {
            let p = k < i ? 1 : k == i ? clamp01(local / 0.35) : 0
            road(d, from: cards[k - 1], to: cards[k], progress: t < 0 ? 0 : p)
        }
        for (k, card) in cards.enumerated() {
            let appear = t < 0 ? 0 : k < i ? 1 : k == i ? clamp01((local - (k == 0 ? 0 : 0.18)) / 0.35) : 0
            draw(d, card, appear: appear)
        }
        ctx.restoreGState()
        ChronicleVideo.footer(d, chronicle)
        if time > Self.intro + Double(n) * beat {
            ChronicleVideo.outro(d, chronicle, (time - Self.intro - Double(n) * beat) / 0.8)
        }
    }

    private func header(_ d: Draw, _ appear: Double) {
        let e = CGFloat(ease(appear))
        d.ctx.saveGState()
        d.ctx.setAlpha(e)
        d.ctx.translateBy(x: 0, y: (1 - e) * 40)
        let cx = Video.width / 2
        d.text("CONSOLE CHRONICLES", x: cx, y: 230, font: Fonts.system(30, .bold), color: chronicle.accent.uiColor(), align: .center, kern: 8)
        d.text(chronicle.title, x: cx, y: 340, font: Fonts.system(84, .bold), color: .white, align: .center, maxWidth: Video.width - 2 * Video.margin)
        d.text(chronicle.summary, x: cx, y: 410, font: Fonts.system(36), color: Video.fog, align: .center)
        d.ctx.restoreGState()
    }

    private func roadPath(from: Card, to: Card) -> CGPath {
        let x1 = from.x + Self.cardW / 2
        let y1 = from.y + from.h
        let x2 = to.x + Self.cardW / 2
        let y2 = to.y
        let mid = (y1 + y2) / 2
        let p = CGMutablePath()
        p.move(to: CGPoint(x: x1, y: y1))
        p.addCurve(to: CGPoint(x: x2, y: y2), control1: CGPoint(x: x1, y: mid), control2: CGPoint(x: x2, y: mid))
        return p
    }

    private func road(_ d: Draw, from: Card, to: Card, progress: Double) {
        guard progress > 0 else { return }
        let ctx = d.ctx
        let a = chronicle.accent.uiColor()
        let y1 = from.y + from.h
        let y2 = to.y
        ctx.saveGState()
        ctx.clip(to: CGRect(x: 0, y: y1 - 20, width: Video.width, height: (y2 - y1 + 40) * CGFloat(progress)))
        let path = roadPath(from: from, to: to)
        switch chronicle.path {
        case .neon:
            ctx.addPath(path)
            ctx.setStrokeColor(chronicle.accent.uiColor(0x44 / 255).cgColor)
            ctx.setLineWidth(26)
            ctx.setLineCap(.round)
            ctx.strokePath()
            ctx.addPath(path)
            ctx.setStrokeColor(a.cgColor)
            ctx.setLineWidth(7)
            ctx.setShadow(offset: .zero, blur: 24, color: a.cgColor)
            ctx.strokePath()
        case .pixel:
            ctx.addPath(path)
            ctx.setLineDash(phase: 0, lengths: [20, 20])
            ctx.setStrokeColor(chronicle.accent.uiColor(0.85).cgColor)
            ctx.setLineWidth(16)
            ctx.setLineCap(.butt)
            ctx.strokePath()
        case .dotted:
            ctx.addPath(path)
            ctx.setLineDash(phase: 0, lengths: [1, 30])
            ctx.setStrokeColor(a.cgColor)
            ctx.setLineWidth(12)
            ctx.setLineCap(.round)
            ctx.strokePath()
        }
        ctx.restoreGState()
        for (x, y, show) in [(from.x + Self.cardW / 2, from.y + from.h, true), (to.x + Self.cardW / 2, to.y, progress >= 1)] where show {
            let dot = CGRect(x: x - 13, y: y - 13, width: 26, height: 26)
            ctx.setFillColor(Video.canvas.cgColor)
            ctx.fillEllipse(in: dot)
            ctx.setStrokeColor(a.cgColor)
            ctx.setLineWidth(6)
            ctx.strokeEllipse(in: dot)
        }
    }

    private func draw(_ d: Draw, _ card: Card, appear: Double) {
        guard appear > 0 else { return }
        let ctx = d.ctx
        let stop = card.stop
        let a = chronicle.accent.uiColor()
        let e = CGFloat(ease(appear))
        ctx.saveGState()
        ctx.setAlpha(e)
        ctx.translateBy(x: 0, y: (1 - e) * 60)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)

        let frame = CGRect(x: card.x, y: card.y, width: Self.cardW, height: card.h)
        ctx.saveGState()
        d.shadow(UIColor(white: 0, alpha: 0.45), blur: 40, y: 16)
        d.fillRounded(frame, 36, Video.card)
        ctx.restoreGState()
        d.strokeRounded(frame, 36, UIColor(white: 1, alpha: 0.08), width: 2)

        let left = card.x + Self.pad
        let inner = Self.cardW - Self.pad * 2
        var y = card.y + Self.pad
        d.text(stop.gotLabel, x: left, y: y + 84, font: Fonts.system(96, .bold), color: a)
        if chronicle.showAges, let age = stop.age {
            let label = "Age \(age)"
            let font = Fonts.system(34, .medium)
            let w = d.width(label, font) + 44
            d.fillRounded(CGRect(x: left + inner - w, y: y + 18, width: w, height: 58), 29, UIColor(white: 1, alpha: 0.12))
            d.text(label, x: left + inner - w + 22, y: y + 59, font: font, color: .white)
        }
        y += 96 + 18

        let box = CGRect(x: left, y: y, width: inner, height: Self.photoH)
        if let art = stop.art, let img = images[art.src] {
            if art.kind == .photo {
                ctx.saveGState()
                d.shadow(UIColor(white: 0, alpha: 0.55), blur: 30, y: 14)
                d.image(img, in: box, cover: false)
                ctx.restoreGState()
            } else {
                d.fillRounded(box, 24, UIColor(white: 1, alpha: 0.92))
                d.image(img, in: box.insetBy(dx: 40, dy: 30), cover: false)
            }
        } else {
            d.fillRounded(box, 24, UIColor(white: 1, alpha: 0.05))
        }
        y += Self.photoH + 24

        if !stop.badges.isEmpty {
            ChronicleVideo.badges(d, stop, accent: a, centreX: nil, x: left, y: y, size: 24)
            y += 52
        }
        d.text(stop.platformName, x: left, y: y + 42, font: Fonts.system(46, .semibold), color: .white, maxWidth: inner)
        y += 56
        if let model = stop.model {
            d.text(model, x: left, y: y + 30, font: Fonts.system(30), color: Video.fog, maxWidth: inner)
            y += 42
        }
        if let note = stop.note {
            d.text("\u{201C}\(note)\u{201D}", x: left, y: y + 32, font: Fonts.italic(32), color: Video.fog, maxWidth: inner)
            y += 44
        }
        if !stop.games.isEmpty {
            y += 24
            for (k, game) in stop.games.enumerated() {
                let rect = CGRect(x: left + CGFloat(k) * (Self.coverW + 24), y: y, width: Self.coverW, height: Self.coverH)
                ctx.saveGState()
                ctx.addPath(d.roundedRect(rect, 14))
                ctx.clip()
                ChronicleVideo.cover(d, images, game.coverUrl, rect)
                ctx.restoreGState()
            }
        }
        ctx.endTransparencyLayer()
        ctx.restoreGState()
    }
}

// MARK: - Year by year

nonisolated struct YearsPlan: VideoPlan {
    let chronicle: Chronicle
    let images: VideoImages
    private static let intro = 1.2
    private let beat: Double
    let duration: Double

    init(chronicle: Chronicle, images: VideoImages) {
        self.chronicle = chronicle
        self.images = images
        beat = ChronicleVideo.beat(chronicle.stops.count, intro: Self.intro, min: 1.6, max: 2.6)
        duration = Self.intro + Double(chronicle.stops.count) * beat + ChronicleVideo.outro
    }

    func draw(_ ctx: CGContext, at time: Double) {
        let d = Draw(ctx: ctx)
        let n = chronicle.stops.count
        ChronicleVideo.background(d, chronicle, cameraY: CGFloat(time * 40))
        let t = time - Self.intro
        if t < 0 {
            title(d, clamp01(time / 0.6))
        } else if n > 0 {
            let i = min(n - 1, Int(floor(t / beat)))
            stop(d, i, clamp01((t - Double(i) * beat) / beat))
        }
        ChronicleVideo.footer(d, chronicle)
        if time > Self.intro + Double(n) * beat {
            ChronicleVideo.outro(d, chronicle, (time - Self.intro - Double(n) * beat) / 0.8)
        }
    }

    private func title(_ d: Draw, _ t: Double) {
        let e = CGFloat(ease(t))
        let cx = Video.width / 2
        let mid = Video.height / 2
        d.ctx.saveGState()
        d.ctx.setAlpha(e)
        d.ctx.translateBy(x: 0, y: (1 - e) * 40)
        d.text("CONSOLE CHRONICLES", x: cx, y: mid - 120, font: Fonts.system(30, .bold), color: chronicle.accent.uiColor(), align: .center, kern: 8)
        d.text(chronicle.title, x: cx, y: mid, font: Fonts.system(92, .bold), color: .white, align: .center, maxWidth: Video.width - 2 * Video.margin)
        d.text(chronicle.name, x: cx, y: mid + 80, font: Fonts.system(38), color: Video.fog, align: .center)
        d.ctx.restoreGState()
    }

    private func stop(_ d: Draw, _ i: Int, _ local: Double) {
        let ctx = d.ctx
        let stops = chronicle.stops
        let stop = stops[i]
        let a = chronicle.accent.uiColor()
        let cx = Video.width / 2
        let prevYear = i > 0 ? stops[i - 1].year : stop.year - 3
        let leave = CGFloat(ease(clamp01((local - 0.88) / 0.12)))
        ctx.saveGState()
        ctx.setAlpha(1 - leave)
        ctx.translateBy(x: -leave * 260, y: 0)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)

        let roll = ease(clamp01(local / 0.35))
        let shown = Int((Double(prevYear) + Double(stop.year - prevYear) * roll).rounded())
        d.text(String(shown), x: cx, y: 520, font: Fonts.system(250, .heavy), color: a, align: .center)
        if chronicle.showAges, let age = stop.age {
            let alpha = CGFloat(clamp01((local - 0.25) / 0.15))
            d.text("AGE \(age)", x: cx, y: 610, font: Fonts.system(50, .semibold), color: UIColor(white: 1, alpha: alpha), align: .center)
        }

        let drop = easeOutBack(clamp01((local - 0.15) / 0.35))
        if drop > 0 {
            ctx.saveGState()
            ctx.setAlpha(CGFloat(clamp01(drop * 3)))
            ChronicleVideo.consoleArt(d, stop, images, CGRect(x: 130, y: 700 - (1 - CGFloat(drop)) * 260, width: 820, height: 460))
            ctx.restoreGState()
        }

        let words = CGFloat(clamp01((local - 0.3) / 0.15))
        if words > 0 {
            ctx.saveGState()
            ctx.setAlpha(words)
            d.text(stop.platformName, x: cx, y: 1270, font: Fonts.system(64, .bold), color: .white, align: .center, maxWidth: Video.width - 2 * Video.margin)
            var y: CGFloat = 1330
            if !stop.badges.isEmpty {
                ChronicleVideo.badges(d, stop, accent: a, centreX: cx, x: 0, y: y - 34, size: 26)
                y += 56
            }
            if let note = stop.note {
                d.text("\u{201C}\(note)\u{201D}", x: cx, y: y, font: Fonts.italic(38), color: Video.fog, align: .center, maxWidth: Video.width - 2 * Video.margin)
            }
            ctx.restoreGState()
        }

        let cw: CGFloat = 250, ch: CGFloat = 333, gap: CGFloat = 30
        let count = CGFloat(stop.games.count)
        let x0 = cx - (count * cw + (count - 1) * gap) / 2
        for (k, game) in stop.games.enumerated() {
            let pop = CGFloat(easeOutBack(clamp01((local - 0.4 - Double(k) * 0.08) / 0.2)))
            guard pop > 0 else { continue }
            let x = x0 + CGFloat(k) * (cw + gap)
            ctx.saveGState()
            ctx.translateBy(x: x + cw / 2, y: 1440 + ch / 2)
            ctx.scaleBy(x: pop, y: pop)
            let rect = CGRect(x: -cw / 2, y: -ch / 2, width: cw, height: ch)
            ctx.saveGState()
            d.shadow(UIColor(white: 0, alpha: 0.5), blur: 30, y: 12)
            d.fillRounded(rect, 18, Video.canvas)
            ctx.restoreGState()
            ctx.addPath(d.roundedRect(rect, 18))
            ctx.clip()
            ChronicleVideo.cover(d, images, game.coverUrl, rect)
            ctx.restoreGState()
        }
        ctx.endTransparencyLayer()
        ctx.restoreGState()
    }
}

// MARK: - Retro CRT

nonisolated struct CRTPlan: VideoPlan {
    let chronicle: Chronicle
    let images: VideoImages
    private static let intro = 1.6
    private static let staticTail = 0.3
    private static let screen = CGRect(x: 70, y: 230, width: 940, height: 1360)
    private let beat: Double
    let duration: Double

    init(chronicle: Chronicle, images: VideoImages) {
        self.chronicle = chronicle
        self.images = images
        beat = ChronicleVideo.beat(chronicle.stops.count, intro: Self.intro, min: 1.8, max: 2.8)
        duration = Self.intro + Double(chronicle.stops.count) * beat + ChronicleVideo.outro
    }

    private var accent: UIColor { chronicle.accent.uiColor() }
    private var sx: CGFloat { Self.screen.minX }
    private var sy: CGFloat { Self.screen.minY }
    private var sw: CGFloat { Self.screen.width }
    private var sh: CGFloat { Self.screen.height }

    func draw(_ ctx: CGContext, at time: Double) {
        let d = Draw(ctx: ctx)
        d.fill(CGRect(x: 0, y: 0, width: Video.width, height: Video.height), .black)
        ctx.saveGState()
        ctx.addPath(d.roundedRect(Self.screen, 70))
        ctx.clip()
        picture(d)
        let frame = Int(time * 30)
        let n = chronicle.stops.count
        let t = time - Self.intro
        let end = Double(n) * beat
        if time < 0.5 {
            noise(d, frame)
        } else if t < 0 {
            titleCard(d, time - 0.5)
        } else if t < end {
            let i = min(n - 1, Int(floor(t / beat)))
            let into = t - Double(i) * beat
            if (into < 0.12 && i == 0) || beat - into < Self.staticTail { noise(d, frame) } else { channel(d, i, into / beat) }
        } else {
            outro(d, (t - end) / ChronicleVideo.outro)
        }
        ctx.restoreGState()
        telly(d)
    }

    private func picture(_ d: Draw) {
        d.fill(Self.screen, UIColor(hex: 0x050807))
        d.linear(Self.screen, from: UIColor(hex: 0x0B1410), to: chronicle.accent.uiColor(0x22 / 255), start: CGPoint(x: 0, y: sy), end: CGPoint(x: 0, y: sy + sh))
    }

    // Repeatable noise, the same generator as the web (mulberry32).
    private func noise(_ d: Draw, _ frame: Int) {
        var seed = UInt32(truncatingIfNeeded: frame &* 7919 &+ 1)
        func next() -> Double {
            seed = seed &+ 0x6D2B79F5
            var t = (seed ^ (seed >> 15)) &* (1 | seed)
            t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
            return Double(t ^ (t >> 14)) / 4294967296
        }
        let cell: CGFloat = 12
        var y = sy
        while y < sy + sh {
            var x = sx
            while x < sx + sw {
                d.ctx.setFillColor(gray: CGFloat(Int(next() * 255)) / 255, alpha: 1)
                d.ctx.fill(CGRect(x: x, y: y, width: cell, height: cell))
                x += cell
            }
            y += cell
        }
    }

    // Steps the size down to fit: the pixel font is wide.
    private func pixel(_ d: Draw, _ text: String, x: CGFloat, y: CGFloat, size: CGFloat, color: UIColor, align: TextAlign = .left) {
        var size = size
        while d.width(text, Fonts.pixel(size)) > sw - 80 && size > 16 { size -= 4 }
        d.text(text, x: x, y: y, font: Fonts.pixel(size), color: color, align: align)
    }

    private func chunkyFrame(_ d: Draw, _ rect: CGRect, _ color: UIColor) {
        d.fill(rect.insetBy(dx: -10, dy: -10), color)
        d.fill(rect.insetBy(dx: -4, dy: -4), .black)
    }

    private func titleCard(_ d: Draw, _ t: Double) {
        let cx = Video.width / 2
        pixel(d, "CONSOLE", x: cx, y: sy + 470, size: 64, color: accent, align: .center)
        pixel(d, "CHRONICLES", x: cx, y: sy + 570, size: 64, color: accent, align: .center)
        pixel(d, chronicle.title.uppercased(), x: cx, y: sy + 760, size: 32, color: .white, align: .center)
        pixel(d, chronicle.name.uppercased(), x: cx, y: sy + 830, size: 24, color: UIColor(hex: 0x9FB3A8), align: .center)
        if Int(t * 2) % 2 == 0 { pixel(d, "PRESS START", x: cx, y: sy + 1100, size: 28, color: .white, align: .center) }
    }

    private func channel(_ d: Draw, _ i: Int, _ local: Double) {
        let stop = chronicle.stops[i]
        let cx = Video.width / 2
        pixel(d, String(format: "CH %02d", i + 1), x: sx + 60, y: sy + 110, size: 36, color: accent)
        if chronicle.showAges, let age = stop.age {
            pixel(d, "AGE \(age)", x: sx + sw - 60, y: sy + 110, size: 28, color: .white, align: .right)
        }
        pixel(d, String(stop.year), x: cx, y: sy + 300, size: 120, color: .white, align: .center)

        let art = CGRect(x: sx + 140, y: sy + 360, width: sw - 280, height: 400)
        d.ctx.saveGState()
        d.ctx.setAlpha(CGFloat(clamp01(local / 0.15)))
        d.ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        chunkyFrame(d, art, accent)
        d.fill(art, UIColor(hex: 0x101614))
        ChronicleVideo.consoleArt(d, stop, images, CGRect(x: art.minX + 30, y: art.minY + 20, width: art.width - 60, height: 360))
        d.ctx.endTransparencyLayer()
        d.ctx.restoreGState()

        pixel(d, stop.platformName.uppercased(), x: cx, y: sy + 860, size: 34, color: accent, align: .center)
        if let note = stop.note {
            pixel(d, "\"\(note.uppercased())\"", x: cx, y: sy + 920, size: 20, color: UIColor(hex: 0xC9D6CF), align: .center)
        }

        let cw: CGFloat = 210, ch: CGFloat = 280, gap: CGFloat = 50
        let count = CGFloat(stop.games.count)
        let x0 = cx - (count * cw + (count - 1) * gap) / 2
        for (k, game) in stop.games.enumerated() where local >= 0.25 + Double(k) * 0.1 {
            let rect = CGRect(x: x0 + CGFloat(k) * (cw + gap), y: sy + 990, width: cw, height: ch)
            chunkyFrame(d, rect, .white)
            d.ctx.saveGState()
            d.ctx.clip(to: rect)
            ChronicleVideo.cover(d, images, game.coverUrl, rect)
            d.ctx.restoreGState()
        }
    }

    private func outro(_ d: Draw, _ t: Double) {
        let cx = Video.width / 2
        let n = chronicle.stops.count
        pixel(d, "END OF", x: cx, y: sy + 520, size: 56, color: accent, align: .center)
        pixel(d, "TRANSMISSION", x: cx, y: sy + 610, size: 56, color: accent, align: .center)
        pixel(d, "\(n) CONSOLE\(n == 1 ? "" : "S") AND COUNTING", x: cx, y: sy + 790, size: 28, color: .white, align: .center)
        if let username = chronicle.username {
            pixel(d, "BEATEN.GAMES/\(username.uppercased())", x: cx, y: sy + 880, size: 22, color: UIColor(hex: 0x9FB3A8), align: .center)
        }
        // The picture closing to a line, as an old set switching off.
        if t > 0.6 {
            let k = CGFloat(clamp01((t - 0.6) / 0.4))
            d.fill(CGRect(x: sx, y: sy, width: sw, height: sh * 0.5 * k), .black)
            d.fill(CGRect(x: sx, y: sy + sh - sh * 0.5 * k, width: sw, height: sh * 0.5 * k), .black)
        }
    }

    private func telly(_ d: Draw) {
        let ctx = d.ctx
        let screen = d.roundedRect(Self.screen, 70)
        // Scanlines and a vignette over the picture.
        ctx.saveGState()
        ctx.addPath(screen)
        ctx.clip()
        ctx.setFillColor(gray: 0, alpha: 0.22)
        var y = sy
        while y < sy + sh { ctx.fill(CGRect(x: sx, y: y, width: sw, height: 3)); y += 6 }
        let centre = CGPoint(x: Video.width / 2, y: sy + sh / 2)
        let colors = [UIColor(white: 0, alpha: 0).cgColor, UIColor(white: 0, alpha: 0.65).cgColor] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            ctx.drawRadialGradient(g, startCenter: centre, startRadius: sh * 0.3, endCenter: centre, endRadius: sh * 0.75, options: [.drawsAfterEndLocation])
        }
        d.linear(Self.screen, from: UIColor(white: 1, alpha: 0.08), to: UIColor(white: 1, alpha: 0), start: Self.screen.origin, end: CGPoint(x: sx + sw * 0.6, y: sy + sh * 0.4))
        ctx.restoreGState()

        // Bezel: everything outside the screen.
        let bezel = CGMutablePath()
        bezel.addRect(CGRect(x: 0, y: 0, width: Video.width, height: Video.height))
        bezel.addPath(screen)
        ctx.addPath(bezel)
        ctx.setFillColor(UIColor(hex: 0x17191C).cgColor)
        ctx.fillPath(using: .evenOdd)
        d.strokeRounded(Self.screen.insetBy(dx: -4, dy: -4), 74, UIColor(hex: 0x2A2E33), width: 8)

        pixel(d, "BEATEN", x: Video.margin + 40, y: sy + sh + 130, size: 34, color: UIColor(hex: 0xC9CED4))
        let knobY = sy + sh + 118
        for x in [Video.width - 260, Video.width - 150] {
            ctx.setFillColor(UIColor(hex: 0x2A2E33).cgColor)
            ctx.fillEllipse(in: CGRect(x: x - 34, y: knobY - 34, width: 68, height: 68))
        }
        ctx.setFillColor(accent.cgColor)
        ctx.fillEllipse(in: CGRect(x: Video.width - 369, y: knobY - 9, width: 18, height: 18))
    }
}
