import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.join(__dirname, '..', 'app');

function getAllTsxFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Audit Fixes', () => {
  describe('Theme tokens', () => {
    it('should have purple token in theme.config.js', () => {
      const config = fs.readFileSync(path.join(__dirname, '..', 'theme.config.js'), 'utf-8');
      expect(config).toContain("purple:");
      expect(config).toContain("#8B5CF6");
    });

    it('should have purple in theme.config.d.ts', () => {
      const dts = fs.readFileSync(path.join(__dirname, '..', 'theme.config.d.ts'), 'utf-8');
      expect(dts).toContain("purple:");
    });
  });

  describe('DJ -> Artist text replacements', () => {
    it('should not have user-facing "DJ" text in venue-detail', () => {
      const content = fs.readFileSync(path.join(APP_DIR, '(manager)', 'venue-detail.tsx'), 'utf-8');
      expect(content).not.toContain('No DJs assigned');
      expect(content).toContain('No artists assigned');
    });

    it('should not have user-facing "DJ" text in edit-venue placeholder', () => {
      const content = fs.readFileSync(path.join(APP_DIR, '(manager)', 'edit-venue.tsx'), 'utf-8');
      expect(content).not.toContain('House rules for DJs');
      expect(content).toContain('House rules for artists');
    });
  });

  describe('Hardcoded colors in inline styles', () => {
    const tsxFiles = getAllTsxFiles(APP_DIR);
    
    it('should not have #2E75B6 in inline styles (outside StyleSheet.create and module-level constants)', () => {
      for (const file of tsxFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.includes('useColors')) continue;
        
        const lines = content.split('\n');
        let inStyleSheet = false;
        let braceDepth = 0;
        let ssStart = -1;
        
        // Find first function/component definition
        const firstFuncLine = lines.findIndex(l => 
          l.includes('export default function') || 
          l.match(/^(export )?function /) ||
          (l.includes('const ') && l.includes('=>') && l.includes('useColors'))
        );
        
        for (let i = 0; i < lines.length; i++) {
          // Skip module-level constants (before first function)
          if (firstFuncLine > 0 && i < firstFuncLine) continue;
          
          if (lines[i].includes('StyleSheet.create(')) {
            inStyleSheet = true;
            ssStart = i;
            braceDepth = 0;
          }
          if (inStyleSheet) {
            braceDepth += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
            if (braceDepth <= 0 && i > ssStart) inStyleSheet = false;
            continue; // Skip StyleSheet lines
          }
          
          // Check for hardcoded #2E75B6 outside StyleSheet
          if (lines[i].includes("'#2E75B6'") && !lines[i].trim().startsWith('//')) {
            const rel = path.relative(path.join(__dirname, '..'), file);
            throw new Error(`Found hardcoded #2E75B6 in inline style at ${rel}:${i + 1}`);
          }
        }
      }
    });
  });

  describe('JSX prop color assignments', () => {
    const tsxFiles = getAllTsxFiles(APP_DIR);
    
    it('should not have color=colors.X without braces', () => {
      const pattern = /\bcolor=colors\.\w+[\s/>]/;
      for (const file of tsxFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const match = content.match(pattern);
        if (match) {
          const rel = path.relative(path.join(__dirname, '..'), file);
          throw new Error(`Found unbraced color prop in ${rel}: ${match[0]}`);
        }
      }
    });
  });

  describe('Touch targets', () => {
    it('should have 44pt minimum for calendar buttons', () => {
      const content = fs.readFileSync(path.join(APP_DIR, '(manager)', '(tabs)', 'calendar.tsx'), 'utf-8');
      // weekAddBtn should be 44
      expect(content).toContain('weekAddBtn: { width: 44, height: 44');
      // monthNavBtn should exist (navigation buttons)
      expect(content).toContain('monthNavBtn:');
      // iconActionBtn should be 44
      expect(content).toContain('iconActionBtn: { width: 44, height: 44');
    });

    it('should have 44pt minimum for profile buttons', () => {
      const managerProfile = fs.readFileSync(path.join(APP_DIR, '(manager)', '(tabs)', 'profile.tsx'), 'utf-8');
      expect(managerProfile).toContain('notifBtn: { width: 44, height: 44');
      expect(managerProfile).toContain('editBtn: { width: 44, height: 44');
    });
  });

  describe('Module-level colors', () => {
    it('should not have colors.X at module level in notifications', () => {
      const managerNotif = fs.readFileSync(path.join(APP_DIR, '(manager)', 'notifications.tsx'), 'utf-8');
      const djNotif = fs.readFileSync(path.join(APP_DIR, '(artist)', 'notifications.tsx'), 'utf-8');
      
      // NOTIF_COLORS should use hardcoded values, not colors.X
      const notifColorsSection = managerNotif.split('NOTIF_COLORS')[1]?.split('}')[0] || '';
      expect(notifColorsSection).not.toContain('colors.');
      
      const djNotifColorsSection = djNotif.split('NOTIF_COLORS')[1]?.split('}')[0] || '';
      expect(djNotifColorsSection).not.toContain('colors.');
    });
  });
});
