// 仅 macOS：生成 icon-src.png。Windows 用的 icon.ico 已经在 src-tauri/icons，不用跑这个脚本。
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
    NSColor.clear.setFill()
    rect.fill()

    // macOS Dock 会把铺满的方图标显得过大；留边 + 透明底
    let inset: CGFloat = 128
    let box = rect.insetBy(dx: inset, dy: inset)
    let radius = box.width * 0.23
    let shape = NSBezierPath(roundedRect: box, xRadius: radius, yRadius: radius)
    NSColor(calibratedRed: 0.18, green: 0.40, blue: 0.56, alpha: 1).setFill()
    shape.fill()

    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 268, weight: .bold),
        .foregroundColor: NSColor.white,
        .kern: -4,
    ]
    let text = "MD" as NSString
    let textSize = text.size(withAttributes: attrs)
    let origin = NSPoint(
        x: (size - textSize.width) / 2,
        y: (size - textSize.height) / 2 + 8
    )
    text.draw(at: origin, withAttributes: attrs)
    return true
}

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:])
else {
    fputs("failed to encode png\n", stderr)
    exit(1)
}

let out = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "icon-src.png"
try png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
