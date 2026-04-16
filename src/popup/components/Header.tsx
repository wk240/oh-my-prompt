import { Download, Upload } from 'lucide-react'
import { Button } from './ui/button'

interface HeaderProps {
  onImport: () => void
  onExport: () => void
}

function Header({ onImport, onExport }: HeaderProps) {
  return (
    <header className="h-12 px-4 flex items-center justify-between border-b border-border">
      <h1 className="text-sm font-medium">Lovart Injector</h1>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" onClick={onImport} title="导入">
          <Upload className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onExport} title="导出">
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}

export default Header