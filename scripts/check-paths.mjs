import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import path from 'path'

app.setName(is.dev ? 'nexus-dev' : 'nexus')
console.log('--- PATH DEBUG ---')
console.log('userData:', app.getPath('userData'))
console.log('pluginsDir:', path.join(app.getPath('userData'), 'plugins'))
console.log('------------------')
app.quit()
