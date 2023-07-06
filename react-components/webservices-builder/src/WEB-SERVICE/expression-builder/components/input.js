import React from "react";
import PropTypes from "prop-types";
import Input from "@material-ui/core/Input";
import classnames from "classnames";
import { TextField } from "@material-ui/core";

function InputField({
  name,
  title,
  autoTitle,
  value = "",
  onChange,
  onBlur,
  readOnly,
  inline,
  InputProps,
  style,
  disableUnderline = false,
  className,
  ...other
}) {
  if (inline) {
    return (
      <Input
        style={{ width: "100%", ...style }}
        className={className}
        placeholder={title}
        inputProps={{ "aria-label": title, disableUnderline }}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete="off"
        readOnly={readOnly}
        disabled={readOnly}
        value={value || ""}
        {...other}
      />
    );
  }
  return (
    <TextField
      id={`filled-${name}`}
      label={title || autoTitle}
      name={name}
      style={{ width: "100%", ...style }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      autoComplete="off"
      InputProps={{ readOnly, ...InputProps, disableUnderline }}
      value={value || ""}
      className={classnames(other.className, className)}
      {...other}
    />
  );
}

InputField.propTypes = {
  name: PropTypes.string,
  title: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  readOnly: PropTypes.bool,
  multiline: PropTypes.bool,
  rows: PropTypes.number,
};

InputField.defaultProps = {
  rows: 3,
  readOnly: false,
};
export default InputField;
