/*
 * Axelor Business Solutions
 *
 * Copyright (C) 2022 Axelor (<http://axelor.com>).
 *
 * This program is free software: you can redistribute it and/or  modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
package com.axelor.studio.bpm.service.deployment;

import com.axelor.studio.db.WkfModel;
import com.axelor.studio.db.WkfProcess;
import com.google.inject.persist.Transactional;
import java.util.Map;

public interface BpmDeploymentService {

  @Transactional
  public void deploy(
      WkfModel sourceModel,
      WkfModel targetModel,
      Map<String, Object> migrationMap,
      boolean upgradeToLatest);

  public void forceMigrate(WkfProcess process);

  void setIsMigrationOnGoing(WkfModel wkfModel, boolean isMigrationOnGoing);
}
