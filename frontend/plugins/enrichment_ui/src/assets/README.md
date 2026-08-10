# Assets Directory

Static assets for this plugin. Currently empty — the icons in use come from
`@tabler/icons-react`, and anything string-named must also exist in
`erxes-ui`'s `ALL_ICONS` registry or it silently renders as `Icon123`.

The generator's `example-icon.svg` / `example-image.svg` were removed (see
`archive/`); nothing imported them.

## Usage

```tsx
import someIcon from '~/assets/some-icon.svg';
```
