import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

const components: Components = {
  pre({ node }) {
    const code = node?.children.find(child => child.type === 'element' && child.tagName === 'code');
    if (!code || code.type !== 'element') return null;
    const text = code.children.filter(child => child.type === 'text').map(child => child.value).join('').replace(/\n$/, '');
    const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
    const language = String(classes.find(value => String(value).startsWith('language-')) || '').replace(/^language-/, '');
    return <CodeBlock text={text} language={language} numbered />;
  },
};
/** Shared safe Markdown for final, streaming, thinking and compaction messages. */
export function ChatMarkdown({ children }: { children: string }) {
  return <Markdown components={components} remarkPlugins={[remarkGfm]} skipHtml>{children}</Markdown>;
}
