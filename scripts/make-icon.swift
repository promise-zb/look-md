// LookMD 图标源图（1024）。各平台尺寸用 `pnpm icons` 从这张图导出。
import AppKit

let canvas: CGFloat = 1024
let ink = NSColor(calibratedRed: 0.13, green: 0.22, blue: 0.20, alpha: 1)
let paper = NSColor(calibratedRed: 0.97, green: 0.94, blue: 0.88, alpha: 1)
let fold = NSColor(calibratedRed: 0.84, green: 0.78, blue: 0.68, alpha: 1)
let ribbonColor = NSColor(calibratedRed: 0.86, green: 0.40, blue: 0.26, alpha: 1)
let mark = NSColor(calibratedRed: 0.16, green: 0.24, blue: 0.22, alpha: 1)

let image = NSImage(size: NSSize(width: canvas, height: canvas), flipped: false) { rect in
    NSColor.clear.setFill()
    rect.fill()

    // 圆角底。留一点边，Dock 缩放后不会被裁满。
    let tile = rect.insetBy(dx: 64, dy: 64)
    let tilePath = NSBezierPath(roundedRect: tile, xRadius: tile.width * 0.22, yRadius: tile.width * 0.22)
    ink.setFill()
    tilePath.fill()

    let page = tile.insetBy(dx: 86, dy: 92).offsetBy(dx: 0, dy: 6)
    let pagePath = NSBezierPath(roundedRect: page, xRadius: 28, yRadius: 28)
    paper.setFill()
    pagePath.fill()

    // 右上角折页。
    let ear: CGFloat = 128
    let earPath = NSBezierPath()
    earPath.move(to: NSPoint(x: page.maxX - ear, y: page.maxY))
    earPath.line(to: NSPoint(x: page.maxX, y: page.maxY))
    earPath.line(to: NSPoint(x: page.maxX, y: page.maxY - ear))
    earPath.close()
    NSGraphicsContext.saveGraphicsState()
    pagePath.addClip()
    fold.setFill()
    earPath.fill()
    NSGraphicsContext.restoreGraphicsState()

    // 书签从纸的上沿垂下，底部剪成尖角。
    let ribbonWidth: CGFloat = 56
    let ribbonX = page.minX + 64
    let ribbonTop = page.maxY + 4
    let ribbonBottom = page.minY + 108
    let ribbon = NSBezierPath()
    ribbon.move(to: NSPoint(x: ribbonX, y: ribbonBottom + 32))
    ribbon.line(to: NSPoint(x: ribbonX, y: ribbonTop))
    ribbon.line(to: NSPoint(x: ribbonX + ribbonWidth, y: ribbonTop))
    ribbon.line(to: NSPoint(x: ribbonX + ribbonWidth, y: ribbonBottom + 32))
    ribbon.line(to: NSPoint(x: ribbonX + ribbonWidth / 2, y: ribbonBottom))
    ribbon.close()
    NSGraphicsContext.saveGraphicsState()
    pagePath.addClip()
    ribbonColor.setFill()
    ribbon.fill()
    NSGraphicsContext.restoreGraphicsState()

    // # 画在书签右侧的正中，小尺寸也能认出是 Markdown。
    let areaMinX = ribbonX + ribbonWidth + 36
    let areaMaxX = page.maxX - 48
    let center = NSPoint(x: (areaMinX + areaMaxX) / 2, y: page.midY - 6)
    let size = NSSize(width: areaMaxX - areaMinX, height: (areaMaxX - areaMinX) * 1.15)
    drawHash(center: center, size: size, color: mark)
    return true
}

func drawHash(center: NSPoint, size: NSSize, color: NSColor) {
    let left = center.x - size.width / 2
    let bottom = center.y - size.height / 2
    func stroke(_ a: NSPoint, _ b: NSPoint, width: CGFloat) {
        let line = NSBezierPath()
        line.lineWidth = width
        line.lineCapStyle = .round
        line.lineJoinStyle = .round
        line.move(to: a)
        line.line(to: b)
        color.setStroke()
        line.stroke()
    }
    let w = size.width
    let h = size.height
    let stem = w * 0.11
    stroke(
        NSPoint(x: left + w * 0.30, y: bottom + h * 0.04),
        NSPoint(x: left + w * 0.16, y: bottom + h * 0.96),
        width: stem
    )
    stroke(
        NSPoint(x: left + w * 0.72, y: bottom + h * 0.04),
        NSPoint(x: left + w * 0.58, y: bottom + h * 0.96),
        width: stem
    )
    stroke(
        NSPoint(x: left + w * 0.04, y: bottom + h * 0.36),
        NSPoint(x: left + w * 0.96, y: bottom + h * 0.44),
        width: stem * 0.92
    )
    stroke(
        NSPoint(x: left + w * 0.00, y: bottom + h * 0.60),
        NSPoint(x: left + w * 0.92, y: bottom + h * 0.68),
        width: stem * 0.92
    )
}

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:])
else {
    fputs("failed to encode png\n", stderr)
    exit(1)
}

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-src.png"
try png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
