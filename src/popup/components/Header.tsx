import { Download, Upload } from 'lucide-react'

interface HeaderProps {
  onImport: () => void
  onExport: () => void
}

function Header({ onImport, onExport }: HeaderProps) {
  return (
    <header className="h-[60px] px-5 flex items-center justify-between border-b border-[#E5E5E5] bg-white">
      {/* Brand Section */}
      <div className="flex items-center gap-2">
        {/* Accent Dot */}
        <div className="w-[6px] h-[6px] rounded-full bg-[#A16207]" />
        {/* Title */}
        <span
          className="text-[14px] font-semibold text-[#171717] tracking-[1px]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          INJECTOR
        </span>
      </div>

      {/* Actions Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={onImport}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="导入"
        >
          <Upload className="w-[18px] h-[18px] text-[#171717]" />
        </button>
        <button
          onClick={onExport}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="导出"
        >
          <Download className="w-[18px] h-[18px] text-[#171717]" />
        </button>
      </div>
    </header>
  )
}

export default Header