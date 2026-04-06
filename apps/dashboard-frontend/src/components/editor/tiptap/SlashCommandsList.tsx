/**
 * SlashCommandsList — Dropdown UI for slash command suggestions.
 * Renders a filterable list of block types with keyboard navigation.
 */

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { SlashCommandItem } from './SlashCommands';
import './slash-commands.css';

interface SlashCommandsListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

const SlashCommandsList = forwardRef(function SlashCommandsList(
  { items, command }: SlashCommandsListProps,
  ref
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    },
    [items, command]
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="slash-commands-dropdown">
        <div className="slash-commands-empty">Kein Ergebnis</div>
      </div>
    );
  }

  return (
    <div className="slash-commands-dropdown">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`slash-commands-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="slash-commands-icon">{item.icon}</span>
          <div className="slash-commands-text">
            <span className="slash-commands-title">{item.title}</span>
            <span className="slash-commands-desc">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
});

export default SlashCommandsList;
