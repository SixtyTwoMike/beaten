import AVFoundation
import UIKit

// Story videos, drawn frame by frame with Core Graphics and encoded with
// the phone's H.264 encoder. The styles mirror src/lib/chronicle-video.ts
// and chronicle-video-styles.ts on the web: same 1080x1920 canvas, same
// timings and positions, so the numbers carry straight across. The
// context is flipped to a top-left origin like a canvas; y is a text
// baseline where the web uses fillText.

nonisolated enum Video {
    static let width: CGFloat = 1080
    static let height: CGFloat = 1920
    static let fps: Int32 = 30

    static let canvas = UIColor(hex: 0x0E1216)
    static let card = UIColor(hex: 0x161C22)
    static let fog = UIColor(hex: 0x8FA0B0)
    static let margin: CGFloat = 48
}

// A video: how long it is, and how to draw the frame at a time.
nonisolated protocol VideoPlan: Sendable {
    var duration: Double { get }
    func draw(_ ctx: CGContext, at time: Double)
}

nonisolated enum VideoStyle: String, CaseIterable, Identifiable, Sendable {
    case road, years, crt
    var id: String { rawValue }
    var label: String {
        switch self {
        case .road: "Road trip"
        case .years: "Year by year"
        case .crt: "Retro CRT"
        }
    }
    var blurb: String {
        switch self {
        case .road: "Travels down your road, console by console."
        case .years: "The years roll over and each console drops in."
        case .crt: "An old telly flicking through the channels."
        }
    }
}

// MARK: - Maths

nonisolated func clamp01(_ t: Double) -> Double { max(0, min(1, t)) }

// Cubic ease in-out, as the web's ease().
nonisolated func ease(_ t: Double) -> Double {
    if t <= 0 { return 0 }
    if t >= 1 { return 1 }
    return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
}

nonisolated func easeOutBack(_ t: Double) -> Double {
    if t <= 0 { return 0 }
    if t >= 1 { return 1 }
    let c = 1.70158
    return 1 + (c + 1) * pow(t - 1, 3) + c * pow(t - 1, 2)
}

// MARK: - Drawing

extension UIColor {
    nonisolated convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat(hex >> 16 & 0xFF) / 255,
            green: CGFloat(hex >> 8 & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

extension ChronicleAccent {
    nonisolated var hex: UInt32 {
        switch self {
        case .mint: 0x00D474
        case .gold: 0xFFB43A
        case .sky: 0x38BDF8
        case .pink: 0xF472B6
        case .white: 0xF3F6F9
        }
    }
    nonisolated func uiColor(_ alpha: CGFloat = 1) -> UIColor { UIColor(hex: hex, alpha: alpha) }
}

nonisolated enum TextAlign { case left, center, right }

nonisolated struct Draw {
    let ctx: CGContext

    func fill(_ rect: CGRect, _ color: UIColor) {
        ctx.setFillColor(color.cgColor)
        ctx.fill(rect)
    }

    func roundedRect(_ rect: CGRect, _ radius: CGFloat) -> CGPath {
        CGPath(roundedRect: rect, cornerWidth: min(radius, rect.width / 2), cornerHeight: min(radius, rect.height / 2), transform: nil)
    }

    func fillRounded(_ rect: CGRect, _ radius: CGFloat, _ color: UIColor) {
        ctx.addPath(roundedRect(rect, radius))
        ctx.setFillColor(color.cgColor)
        ctx.fillPath()
    }

    func strokeRounded(_ rect: CGRect, _ radius: CGFloat, _ color: UIColor, width: CGFloat) {
        ctx.addPath(roundedRect(rect, radius))
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(width)
        ctx.strokePath()
    }

    // Shadow offsets are in device space, which isn't flipped: a positive
    // web offsetY (down) is a negative height here.
    func shadow(_ color: UIColor, blur: CGFloat, y: CGFloat) {
        ctx.setShadow(offset: CGSize(width: 0, height: -y), blur: blur, color: color.cgColor)
    }

    func noShadow() { ctx.setShadow(offset: .zero, blur: 0, color: nil) }

    func radialGlow(center: CGPoint, radius: CGFloat, color: UIColor, alpha: CGFloat) {
        let colors = [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor] as CFArray
        guard let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
        ctx.drawRadialGradient(g, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: [])
    }

    func linear(_ rect: CGRect, from: UIColor, to: UIColor, start: CGPoint, end: CGPoint) {
        let colors = [from.cgColor, to.cgColor] as CFArray
        guard let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
        ctx.saveGState()
        ctx.clip(to: rect)
        ctx.drawLinearGradient(g, start: start, end: end, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        ctx.restoreGState()
    }

    func attributes(_ font: UIFont, _ color: UIColor, kern: CGFloat = 0) -> [NSAttributedString.Key: Any] {
        [.font: font, .foregroundColor: color, .kern: kern]
    }

    func width(_ text: String, _ font: UIFont, kern: CGFloat = 0) -> CGFloat {
        (text as NSString).size(withAttributes: attributes(font, .white, kern: kern)).width
    }

    // Shortened with an ellipsis to fit, like the web's fit().
    func fit(_ text: String, _ font: UIFont, max: CGFloat) -> String {
        if width(text, font) <= max { return text }
        var t = text
        while t.count > 1 && width(t + "…", font) > max { t.removeLast() }
        return t + "…"
    }

    // y is the baseline, as canvas fillText.
    func text(_ text: String, x: CGFloat, y: CGFloat, font: UIFont, color: UIColor, align: TextAlign = .left, kern: CGFloat = 0, maxWidth: CGFloat? = nil) {
        let s = maxWidth.map { fit(text, font, max: $0) } ?? text
        let w = width(s, font, kern: kern)
        let left = switch align {
        case .left: x
        case .center: x - w / 2
        case .right: x - w
        }
        UIGraphicsPushContext(ctx)
        (s as NSString).draw(at: CGPoint(x: left, y: y - font.ascender), withAttributes: attributes(font, color, kern: kern))
        UIGraphicsPopContext()
    }

    // Fit inside (contain) or fill (cover) a box, centred.
    func image(_ image: UIImage, in box: CGRect, cover: Bool, alpha: CGFloat = 1) {
        let sx = box.width / image.size.width
        let sy = box.height / image.size.height
        let scale = cover ? max(sx, sy) : min(sx, sy)
        let w = image.size.width * scale
        let h = image.size.height * scale
        UIGraphicsPushContext(ctx)
        image.draw(in: CGRect(x: box.midX - w / 2, y: box.midY - h / 2, width: w, height: h), blendMode: .normal, alpha: alpha)
        UIGraphicsPopContext()
    }

    func star(center: CGPoint, radius: CGFloat, color: UIColor) {
        let path = CGMutablePath()
        for i in 0..<10 {
            let r = i % 2 == 0 ? radius : radius * 0.45
            let a = -Double.pi / 2 + Double(i) * Double.pi / 5
            let p = CGPoint(x: center.x + r * cos(a), y: center.y + r * sin(a))
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        ctx.addPath(path)
        ctx.setFillColor(color.cgColor)
        ctx.fillPath()
    }
}

nonisolated enum Fonts {
    static func system(_ size: CGFloat, _ weight: UIFont.Weight = .regular) -> UIFont { .systemFont(ofSize: size, weight: weight) }
    static func italic(_ size: CGFloat) -> UIFont { .italicSystemFont(ofSize: size) }
    static func pixel(_ size: CGFloat) -> UIFont { UIFont(name: "PressStart2P-Regular", size: size) ?? .monospacedSystemFont(ofSize: size, weight: .bold) }
}

// MARK: - Images

// Console art and covers for a chronicle, fetched up front. Keys are URLs.
nonisolated struct VideoImages: Sendable {
    let images: [URL: UIImage]

    subscript(_ url: URL?) -> UIImage? { url.flatMap { images[$0] } }

    // Sharper covers than the app shows: the video is full screen.
    static func bigCover(_ url: URL?) -> URL? {
        url.flatMap { URL(string: $0.absoluteString.replacingOccurrences(of: "/t_cover_big/", with: "/t_cover_big_2x/")) }
    }

    static func load(_ urls: Set<URL>) async -> VideoImages {
        await withTaskGroup(of: (URL, UIImage?).self) { group in
            for url in urls {
                group.addTask {
                    guard let (data, _) = try? await URLSession.shared.data(from: url) else { return (url, nil) }
                    return (url, UIImage(data: data))
                }
            }
            var images: [URL: UIImage] = [:]
            for await (url, image) in group { if let image { images[url] = image } }
            return VideoImages(images: images)
        }
    }
}

// MARK: - Encoding

nonisolated enum VideoEncoder {
    struct Failed: LocalizedError {
        var errorDescription: String? { "Couldn't make the video on this iPhone. Try again." }
    }

    // Draws every frame of the plan into an H.264 MP4 at `url`.
    static func render(_ plan: VideoPlan, to url: URL, progress: @Sendable (Double) -> Void) async throws {
        try? FileManager.default.removeItem(at: url)
        let w = Int(Video.width)
        let h = Int(Video.height)
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: w,
            AVVideoHeightKey: h,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 6_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: Int(Video.fps) * 2,
            ],
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: w,
            kCVPixelBufferHeightKey as String: h,
        ])
        writer.add(input)
        guard writer.startWriting() else { throw Failed() }
        writer.startSession(atSourceTime: .zero)

        let frames = Int((plan.duration * Double(Video.fps)).rounded())
        for f in 0..<frames {
            try Task.checkCancellation()
            while !input.isReadyForMoreMediaData { try await Task.sleep(for: .milliseconds(5)) }
            guard let pool = adaptor.pixelBufferPool else { throw Failed() }
            var buffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
            guard let buffer else { throw Failed() }
            CVPixelBufferLockBaseAddress(buffer, [])
            guard let ctx = CGContext(
                data: CVPixelBufferGetBaseAddress(buffer),
                width: w, height: h, bitsPerComponent: 8,
                bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
            ) else {
                CVPixelBufferUnlockBaseAddress(buffer, [])
                throw Failed()
            }
            ctx.translateBy(x: 0, y: CGFloat(h))
            ctx.scaleBy(x: 1, y: -1)
            plan.draw(ctx, at: Double(f) / Double(Video.fps))
            CVPixelBufferUnlockBaseAddress(buffer, [])
            guard adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: Video.fps)) else { throw Failed() }
            if f % 10 == 0 { progress(Double(f) / Double(frames)) }
        }
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw Failed() }
        progress(1)
    }

    // One frame as an image, for previews and tests.
    static func still(_ plan: VideoPlan, at time: Double) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: Video.width, height: Video.height), format: format).image { r in
            plan.draw(r.cgContext, at: time)
        }
    }
}
