import { Link } from 'react-router-dom';

/** 把消息正文中的链接渲染为可点击元素；站内招募链接走路由跳转。 */
export function MessageBody({ body }: { body: string }) {
  return (
    <>
      {body.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
        if (!/^https?:\/\//.test(part)) return part;
        try {
          const url = new URL(part);
          if (url.origin === window.location.origin && url.hash.startsWith('#/detail/'))
            return (
              <Link key={index} to={url.hash.slice(1)}>
                {part}
              </Link>
            );
          return (
            <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">
              {part}
            </a>
          );
        } catch {
          return part;
        }
      })}
    </>
  );
}
