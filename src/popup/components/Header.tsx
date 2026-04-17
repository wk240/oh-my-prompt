import { Download, Upload } from 'lucide-react'

interface HeaderProps {
  onImport: () => void
  onExport: () => void
}

function Header({ onImport, onExport }: HeaderProps) {
  return (
    <header className="h-[68px] px-6 flex items-center justify-between border-b border-[#E5E5E5] bg-white">
      {/* Brand Section */}
      <div className="flex items-center gap-2.5">
        {/* Accent Dot */}
        <div className="w-[8px] h-[8px] rounded-full bg-[#A16207]" />
        {/* Title */}
        <span
          className="text-[16px] font-semibold text-[#171717] tracking-[1px]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          INJECTOR
        </span>
      </div>

      {/* Actions Section */}
      <div className="flex items-center gap-5">
        <button
          onClick={onImport}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="导入"
        >
          <Upload className="w-[20px] h-[20px] text-[#171717]" />
        </button>
        <button
          onClick={onExport}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="导出"
        >
          <Download className="w-[20px] h-[20px] text-[#171717]" />
        </button>
      </div>
    </header>
  )
}

export default Header