import React, { useImperativeHandle, useRef } from "react"
import Chip from "@mui/material/Chip"
import IconButton from "@mui/material/IconButton"
import clsx from "clsx"
import { styled } from "@mui/material/styles"
import { useDrag, useDrop } from "react-dnd"
import TextField from "@mui/material/TextField"
import Select from "./Select"
import fontAwesomeList from "../fa-icons"
import { WKF_COLORS } from "../../constants"

const ItemTypes = {
	CARD: "card",
}

const StyledIcons = styled("i")(() => ({
	"& > i": {
		height: "1.5em",
		width: "1.5em",
		fontSize: 16,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
}))

const Content = React.forwardRef(
	(
		{
			row = {},
			index,
			id,
			handleRow,
			deleteRow,
			handleChange,
			updateSelection,
			addRow,
			rowsCount,
			moveCard,
		},
		ref
	) => {
		const elementRef = useRef(null)

		useImperativeHandle(ref, () => ({
			getNode: () => elementRef.current,
		}))

		const [, drag] = useDrag({
			type: ItemTypes.CARD,
			item: () => ({
				index,
				id,
			}),
		})

		const [, drop] = useDrop({
			accept: ItemTypes.CARD,
			hover(item, monitor) {
				if (!elementRef.current) {
					return
				}
				const dragIndex = item.index
				const hoverIndex = index
				// Don't replace items with themselves
				if (dragIndex === hoverIndex) {
					return
				}
				// Determine rectangle on screen
				const hoverBoundingRect = elementRef.current?.getBoundingClientRect()
				// Get vertical middle
				const hoverMiddleY =
					(hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
				// Determine mouse position
				const clientOffset = monitor.getClientOffset()
				// Get pixels to the top
				const hoverClientY = clientOffset.y - hoverBoundingRect.top
				// Only perform the move when the mouse has crossed half of the items height
				// When dragging downwards, only move when the cursor is below 50%
				// When dragging upwards, only move when the cursor is above 50%
				// Dragging downwards
				if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
					return
				}
				// Dragging upwards
				if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
					return
				}
				// Time to actually perform the action
				moveCard(dragIndex, hoverIndex)
				// Note: we're mutating the monitor item here!
				// Generally it's better to avoid mutations,
				// but it's good here for the sake of performance
				// to avoid expensive index searches.
				item.index = hoverIndex
			},
		})

		return (
			<tr
				style={{ display: "flex", alignItems: "center" }}
				key={row.id || index}
				ref={(el) => {
					elementRef.current = el
					drag(el)
					drop(el)
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" && rowsCount - 1 === index) {
						handleRow(rowsCount - 1)
						addRow()
					}
				}}
			>
				<td
					className="one-to-many-col one-to-many-col-border"
					style={{ maxWidth: "4%", display: "flex", justifyContent: "center" }}
				>
					<IconButton
						onClick={() => handleRow(row.id)}
						aria-label="add"
						size="small"
						disabled={!updateSelection}
					>
						<StyledIcons>
							<i
								className={clsx("fa fa-pencil")}
								style={{
									color: updateSelection ? "black" : "rgba(0, 0, 0, 0.26)",
								}}
							/>
						</StyledIcons>
					</IconButton>
				</td>
				<td
					className="one-to-many-col one-to-many-col-border"
					style={{
						maxWidth: "22%",
						overflow: "hidden",
						whiteSpace: "nowrap",
						textOverflow: "ellipsis",
					}}
				>
					{row.editable ? (
						<TextField
							variant="standard"
							value={row?.value || ""}
							name="value"
							onChange={(e) => {
								handleChange(row.id, "value", e.target.value)
							}}
							InputProps={{ sx: { fontSize: 13 } }}
							autoFocus={true}
						/>
					) : (
						row.value
					)}
				</td>
				<td
					className="one-to-many-col one-to-many-col-border"
					style={{
						maxWidth: "22%",
						overflow: "hidden",
						whiteSpace: "nowrap",
						textOverflow: "ellipsis",
					}}
				>
					{row.editable ? (
						<TextField
							variant="standard"
							value={row?.title || ""}
							name="title"
							onChange={(e) => {
								handleChange(row.id, "title", e.target.value)
							}}
							InputProps={{ sx: { fontSize: 13 } }}
						/>
					) : (
						row.title
					)}
				</td>
				<td
					className={"one-to-many-col one-to-many-col-border"}
					style={{ overflow: "hidden", maxWidth: "22%" }}
				>
					{row.editable ? (
						<Select
							name="color"
							onChange={(value) => {
								handleChange(row.id, "color", value)
							}}
							value={row?.color || ""}
							options={WKF_COLORS}
							optionLabel="title"
							optionValue="name"
						/>
					) : (
						row?.color && (
							<Chip
								label={row.color?.title}
								size="small"
								style={{
									background: row.color?.color,
									color: row.color?.border || "white",
									fontWeight: 800,
								}}
							/>
						)
					)}
				</td>
				<td
					className="one-to-many-col one-to-many-col-border"
					style={{
						maxWidth: "22%",
						overflow: "hidden",
						whiteSpace: "nowrap",
						textOverflow: "ellipsis",
					}}
				>
					{row.editable ? (
						<Select
							name="icon"
							onChange={(value) => {
								handleChange(row.id, "icon", value)
							}}
							value={row?.icon || ""}
							options={fontAwesomeList}
						/>
					) : (
						row.icon
					)}
				</td>
				<td
					className="one-to-many-col one-to-many-col-border"
					style={{ maxWidth: "4%" }}
				>
					<IconButton
						onClick={() => deleteRow(row.id)}
						aria-label="add"
						size="small"
						disabled={!updateSelection}
					>
						<StyledIcons>
							<i
								className={clsx("fa fa-trash-o")}
								style={{
									color: updateSelection ? "black" : "rgba(0, 0, 0, 0.26)",
								}}
							/>
						</StyledIcons>
					</IconButton>
				</td>
				<td
					className="one-to-many-col one-to-many-col-border"
					style={{ maxWidth: "4%" }}
				>
					<IconButton
						onClick={() => handleRow(row.id)}
						aria-label="add"
						size="small"
						disabled={!updateSelection}
					>
						<StyledIcons>
							<i
								className={clsx("fa fa-bars")}
								style={{
									color: updateSelection ? "black" : "rgba(0, 0, 0, 0.26)",
								}}
							/>
						</StyledIcons>
					</IconButton>
				</td>
			</tr>
		)
	}
)
export default Content
