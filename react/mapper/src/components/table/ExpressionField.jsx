import React from 'react';
import IconButton from '../IconButton';

import ExpressionBuilder from 'generic-builder/src/views';
import { fetchModelByFullName } from '../../services/api';
import { translate } from '../../utils';
import { Box, Button, Input, Dialog, DialogContent } from '@axelor/ui';
import { MaterialIcon } from '@axelor/ui/icons/material-icon';
import styles from './expression-field.module.css';
import DialogBox from '../Dialog';

function ExpressionBuilderDummy() {
  return <p>Integrate Generic builder</p>;
}

export default function ExpressionField({
  parameters,
  target,
  selected,
  onSelectedChange,
  expression,
  onExpressionChange,
  error,
}) {
  const [open, setOpen] = React.useState(false);
  const [defaultModel, setDefaultModel] = React.useState(null);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleExpression = (val, exprVal) => {
    if (val && exprVal) {
      onSelectedChange(val);
      onExpressionChange(exprVal);
      handleClose();
    }
  };

  const handleRemove = () => {
    onSelectedChange(null);
    onExpressionChange(null);
  };

  React.useEffect(() => {
    if (target) {
      (async () => {
        const data = await fetchModelByFullName(target);
        setDefaultModel(data);
      })();
    }
  }, [target]);

  return (
    <Box color="body" d="flex" alignItems="center" gap={4}>
      <Input
        type="text"
        value={selected || ''}
        flex={1}
        onChange={(e) => {
          const value = e?.target?.value;
          onSelectedChange(value);
          onExpressionChange(null);
        }}
        readOnly={parameters}
        disabled={parameters && true}
        disableUnderline={parameters && !error && true}
        invalid={error && (!selected || selected?.trim() === '')}
      />
      {selected && parameters && (
        <IconButton size="small" onClick={handleRemove}>
          <MaterialIcon icon="close" color="body" fontSize={16} />
        </IconButton>
      )}
      <IconButton
        size="small"
        onClick={handleClickOpen}
        style={{ color: 'inherit' }}
      >
        <MaterialIcon icon="edit" fontSize={16} style={{ marginLeft: 1.5 }} />
      </IconButton>
      {ExpressionBuilder ? (
        <ExpressionBuilder
          open={open}
          DialogBox={DialogBox}
          parameters={parameters}
          defaultModel={defaultModel}
          onSave={handleExpression}
          exprVal={expression}
          isMapper={true}
          dialogActionButton={
            <Button
              onClick={handleClose}
              variant="secondary"
              className={styles.cancelButton}
            >
              {translate('Cancel')}
            </Button>
          }
        />
      ) : (
        <ExpressionBuilderDummy />
      )}
    </Box>
  );
}
