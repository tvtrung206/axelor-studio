import React from 'react';
import classnames from 'classnames';

import { Select, Box } from '@axelor/ui';

import { makeStyles } from '@material-ui/core/styles';
import { translate } from '../../utils';

const useStyles = makeStyles((theme) => ({
  formControl: {
    width: '100%',
  },
  select: {
    marginRight: 8,
    '& > div': {
      '& > input': {
        width: '100%',
      },
    },
  },
}));

export default function Selection({
  name,
  value = '',
  onChange,
  options,
  title,
  className,
  error,
  ...rest
}) {
  const classes = useStyles();
  return (
    <Box
      d="flex"
      flexDirection="column"
      className={classnames(classes.formControl, className)}
    >
      <Select
        value={value ?? null}
        onChange={(value) => onChange(value)}
        name={name}
        className={classes.select}
        flex="1"
        placeholder={translate(title) || ''}
        invalid={error && !value}
        options={options}
        optionKey={(option) => option.name}
        optionLabel={(option) => option.title}
        {...rest}
      />
    </Box>
  );
}
